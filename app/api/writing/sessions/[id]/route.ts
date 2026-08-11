import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canLearn, getSessionUser } from "@/lib/session";
import { getWritingSessionForViewer, recalculateWritingProfile } from "@/lib/writing-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await ctx.params;
  const session = await getWritingSessionForViewer(id, user.id);
  if (!session) return NextResponse.json({ error: "练习不存在" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await ctx.params;
  const session = await prisma.writingSession.findFirst({ where: { id, userId: user.id }, select: { kind: true, status: true } });
  if (session?.kind === "review" && session.status === "active") {
    return NextResponse.json({ error: "进行中的到期复练不能删除，请先完成" }, { status: 409 });
  }
  const result = await prisma.writingSession.deleteMany({ where: { id, userId: user.id } });
  if (!result.count) return NextResponse.json({ error: "练习不存在" }, { status: 404 });
  await recalculateWritingProfile(user.id);
  return NextResponse.json({ ok: true });
}
