import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { advanceStage, nextReviewDate } from "@/lib/scheduler";

// 记录一次学习/检查结果，推进记忆曲线
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
  const newStage = advanceStage(existing?.stage ?? 0, correct);
  const nextAt = nextReviewDate(newStage);

  await prisma.wordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    create: {
      userId: user.id,
      wordId,
      stage: newStage,
      nextReviewAt: nextAt,
      lastResult: result,
      reps: correct ? 1 : 0,
      lapses: correct ? 0 : 1,
    },
    update: {
      stage: newStage,
      nextReviewAt: nextAt,
      lastResult: result,
      reps: { increment: correct ? 1 : 0 },
      lapses: { increment: correct ? 0 : 1 },
    },
  });

  await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result } });

  return NextResponse.json({ ok: true, stage: newStage, nextReviewAt: nextAt });
}
