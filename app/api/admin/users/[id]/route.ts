import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 管理员查看某用户最近学习记录
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  const logs = await prisma.studyLog.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { word: { select: { text: true, meaningCn: true } } },
  });
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      word: l.word.text,
      meaningCn: l.word.meaningCn,
      mode: l.mode,
      result: l.result,
      createdAt: l.createdAt,
    })),
  });
}

// 管理员修改用户任务量
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (Number.isInteger(body.dailyNewTarget) && body.dailyNewTarget >= 1 && body.dailyNewTarget <= 200) {
    data.dailyNewTarget = body.dailyNewTarget;
  }
  if (Number.isInteger(body.dailyReviewTarget) && body.dailyReviewTarget >= 1 && body.dailyReviewTarget <= 500) {
    data.dailyReviewTarget = body.dailyReviewTarget;
  }
  // 重置密码
  if (typeof body.newPassword === "string") {
    if (body.newPassword.length < 4) {
      return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
    }
    const bcrypt = (await import("bcryptjs")).default;
    data.passwordHash = bcrypt.hashSync(body.newPassword, 10);
  }
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  await prisma.user.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
