import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";
import { hexColor } from "@/lib/theme";

// 管理员查看某用户最近学习记录
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const { id } = await params;
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

// 管理员修改用户任务量
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
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
  // 高亮颜色："" 或 null 表示清除
  if (body.highlightColor === "" || body.highlightColor === null) {
    data.highlightColor = null;
  } else if (typeof body.highlightColor === "string") {
    if (hexColor(body.highlightColor) !== body.highlightColor) {
      return NextResponse.json({ error: "高亮颜色格式错误（应为 #RRGGBB）" }, { status: 400 });
    }
    data.highlightColor = body.highlightColor;
  }
  // 重置密码
  if (typeof body.newPassword === "string") {
    if (body.newPassword.length < 4) {
      return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
    }
    const bcrypt = (await import("bcryptjs")).default;
    data.passwordHash = bcrypt.hashSync(body.newPassword, 10);
  }
  // 绑定孩子：仅目标是家长时有效；childIds = 选中的孩子 id 列表
  if (Array.isArray(body.childIds)) {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    if (target.role !== "parent") {
      return NextResponse.json({ error: "只有家长账号可以绑定孩子" }, { status: 400 });
    }
    const childIds = body.childIds.filter((x: unknown) => typeof x === "string") as string[];
    await prisma.$transaction([
      // 新选中的孩子绑定到该家长
      prisma.user.updateMany({ where: { id: { in: childIds }, role: "user" }, data: { parentId: id } }),
      // 原先绑定该家长但本次未选中的孩子解绑
      prisma.user.updateMany({ where: { parentId: id, id: { notIn: childIds } }, data: { parentId: null } }),
    ]);
  }
  if (!Object.keys(data).length && !Array.isArray(body.childIds)) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  if (Object.keys(data).length) {
    await prisma.user.update({ where: { id }, data });
  }
  return NextResponse.json({ ok: true });
}
