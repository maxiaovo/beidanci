import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { advanceStage, nextReviewDate } from "@/lib/scheduler";
import { isStrictCheck } from "@/lib/settings";

// 记录一次学习/检查结果，推进记忆曲线
// 强检查开启时：拼写检查和选择检查都答对才算通过（stage 才推进）
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { wordId, mode, result } = await req.json().catch(() => ({}));
  if (!wordId || !mode || !["correct", "wrong", "giveup"].includes(result)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) return NextResponse.json({ error: "单词不存在" }, { status: 404 });

  const existing = await prisma.wordProgress.findUnique({
    where: { userId_wordId: { userId: user.id, wordId } },
  });

  const correct = result === "correct";
  const strict = (await isStrictCheck()) && mode.startsWith("check");

  let spellPassed = existing?.spellPassed ?? false;
  let choicePassed = existing?.choicePassed ?? false;
  let newStage: number;
  let nextAt: Date;

  if (strict) {
    if (correct) {
      if (mode === "check-spell") spellPassed = true;
      if (mode === "check-choice") choicePassed = true;
      const bothPassed = spellPassed && choicePassed;
      if (bothPassed) {
        // 两种检查都过了：推进记忆曲线，并清空本轮标记
        newStage = advanceStage(existing?.stage ?? 0, true);
        nextAt = nextReviewDate(newStage);
        spellPassed = false;
        choicePassed = false;
      } else {
        // 只过了一种：stage 不变，复习时间不变（词仍留在到期队列里）
        newStage = existing?.stage ?? 0;
        nextAt = existing?.nextReviewAt ?? nextReviewDate(0);
      }
    } else {
      // 答错/放弃：本轮两种检查标记清零，降回 stage 0
      spellPassed = false;
      choicePassed = false;
      newStage = advanceStage(existing?.stage ?? 0, false);
      nextAt = nextReviewDate(newStage);
    }
  } else {
    newStage = advanceStage(existing?.stage ?? 0, correct);
    nextAt = nextReviewDate(newStage);
    spellPassed = false;
    choicePassed = false;
  }

  await prisma.wordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    create: {
      userId: user.id,
      wordId,
      stage: newStage,
      nextReviewAt: nextAt,
      lastResult: result,
      spellPassed,
      choicePassed,
      reps: correct ? 1 : 0,
      lapses: correct ? 0 : 1,
    },
    update: {
      stage: newStage,
      nextReviewAt: nextAt,
      lastResult: result,
      spellPassed,
      choicePassed,
      reps: { increment: correct ? 1 : 0 },
      lapses: { increment: correct ? 0 : 1 },
    },
  });

  await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result } });

  return NextResponse.json({ ok: true, stage: newStage, nextReviewAt: nextAt });
}
