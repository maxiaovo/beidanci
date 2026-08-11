import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessChild } from "@/lib/session";

// 家长查看某孩子最近学习记录（学了哪些词）
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await canAccessChild(viewer, id))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const [logs, skips] = await Promise.all([
    prisma.studyLog.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { word: { select: { text: true, meaningCn: true } } },
    }),
    prisma.reviewSkip.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      word: l.word.text,
      meaningCn: l.word.meaningCn,
      mode: l.mode,
      result: l.result,
      createdAt: l.createdAt,
    })),
    skips: skips.map((s) => ({ id: s.id, count: s.count, createdAt: s.createdAt })),
  });
}

// 家长给孩子指定每日任务量
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await canAccessChild(viewer, id))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  // null 表示恢复全局默认
  if (body.dailyNewTarget === null) {
    data.dailyNewTarget = null;
  } else if (Number.isInteger(body.dailyNewTarget) && body.dailyNewTarget >= 1 && body.dailyNewTarget <= 200) {
    data.dailyNewTarget = body.dailyNewTarget;
  }
  if (body.dailyReviewTarget === null) {
    data.dailyReviewTarget = null;
  } else if (Number.isInteger(body.dailyReviewTarget) && body.dailyReviewTarget >= 1 && body.dailyReviewTarget <= 500) {
    data.dailyReviewTarget = body.dailyReviewTarget;
  }
  // 复习补考：答错后需累计答对 N 次才算过；循环补考 = 补考中再错则清零重计
  if (Number.isInteger(body.recoveryCorrectTarget) && body.recoveryCorrectTarget >= 1 && body.recoveryCorrectTarget <= 5) {
    data.recoveryCorrectTarget = body.recoveryCorrectTarget;
  }
  if (typeof body.cyclicRecovery === "boolean") {
    data.cyclicRecovery = body.cyclicRecovery;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
