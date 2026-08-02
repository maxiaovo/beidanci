import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { isStrictCheck } from "@/lib/settings";
import { decideProgress, type ProgressMode, type ProgressResult } from "@/lib/progress-decision";

// 记录一次学习/检查结果，推进记忆曲线
// 强检查开启时：拼写检查和选择检查都答对才算通过（stage 才推进）
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const { wordId, mode, result, hadFailure = false } = await req.json().catch(() => ({}));
  const validModes: ProgressMode[] = ["learn", "check-spell", "check-choice"];
  const validResults: ProgressResult[] = ["correct", "wrong", "giveup"];
  if (!wordId || !validModes.includes(mode) || !validResults.includes(result) || typeof hadFailure !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) return NextResponse.json({ error: "单词不存在" }, { status: 404 });

  const existing = await prisma.wordProgress.findUnique({
    where: { userId_wordId: { userId: user.id, wordId } },
  });

  const correct = result === "correct";
  const strict = (await isStrictCheck()) && mode.startsWith("check");
  const decision = decideProgress({ existing, mode, result, strict, hadFailure });

  await prisma.wordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    create: {
      userId: user.id,
      wordId,
      stage: decision.stage,
      nextReviewAt: decision.nextReviewAt,
      lastResult: result,
      spellPassed: decision.spellPassed,
      choicePassed: decision.choicePassed,
      reps: correct ? 1 : 0,
      lapses: correct ? 0 : 1,
    },
    update: {
      stage: decision.stage,
      nextReviewAt: decision.nextReviewAt,
      lastResult: result,
      spellPassed: decision.spellPassed,
      choicePassed: decision.choicePassed,
      reps: { increment: correct ? 1 : 0 },
      lapses: { increment: correct ? 0 : 1 },
    },
  });

  await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result } });

  return NextResponse.json({ ok: true, stage: decision.stage, nextReviewAt: decision.nextReviewAt });
}
