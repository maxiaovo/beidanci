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
  if (Number.isInteger(body.dailyNewTarget) && body.dailyNewTarget >= 1 && body.dailyNewTarget <= 200) {
    data.dailyNewTarget = body.dailyNewTarget;
  }
  if (Number.isInteger(body.dailyReviewTarget) && body.dailyReviewTarget >= 1 && body.dailyReviewTarget <= 500) {
    data.dailyReviewTarget = body.dailyReviewTarget;
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
