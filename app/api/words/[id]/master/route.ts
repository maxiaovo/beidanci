import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canLearn, getSessionUser } from "@/lib/session";
import { MAX_STAGE } from "@/lib/scheduler";

// 标记已掌握 / 取消掌握
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id: wordId } = await params;
  const { mastered } = await req.json().catch(() => ({ mastered: true }));

  if (mastered) {
    const far = new Date();
    far.setFullYear(far.getFullYear() + 10);
    await prisma.wordProgress.upsert({
      where: { userId_wordId: { userId: user.id, wordId } },
      create: { userId: user.id, wordId, stage: MAX_STAGE, nextReviewAt: far, lastResult: "correct" },
      update: { stage: MAX_STAGE, nextReviewAt: far },
    });
  } else {
    await prisma.wordProgress.deleteMany({ where: { userId: user.id, wordId } });
  }
  return NextResponse.json({ ok: true });
}
