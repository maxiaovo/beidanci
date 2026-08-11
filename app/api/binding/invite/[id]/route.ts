import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// 撤销自己发出的绑定邀约
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const invite = await prisma.bindingInvite.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: "邀约不存在" }, { status: 404 });

  const mine =
    (me.role === "parent" && invite.parentId === me.id && invite.createdBy === "parent") ||
    (me.role === "user" && invite.childId === me.id && invite.createdBy === "child");
  if (!mine) return NextResponse.json({ error: "只能撤销自己发出的邀约" }, { status: 403 });

  await prisma.bindingInvite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
