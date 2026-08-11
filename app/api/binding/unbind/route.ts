import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// 解除绑定：孩子解除自己的家长；家长解除指定孩子（body: { childId }）
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  if (me.role === "user") {
    if (!me.parentId) return NextResponse.json({ error: "当前没有绑定家长" }, { status: 400 });
    await prisma.user.update({ where: { id: me.id }, data: { parentId: null } });
    return NextResponse.json({ ok: true });
  }

  if (me.role === "parent") {
    const body = await req.json().catch(() => null);
    const childId = String(body?.childId ?? "");
    const child = childId
      ? await prisma.user.findUnique({ where: { id: childId }, select: { parentId: true } })
      : null;
    if (!child || child.parentId !== me.id) {
      return NextResponse.json({ error: "该孩子未与你绑定" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: childId }, data: { parentId: null } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "管理员请在管理后台操作" }, { status: 403 });
}
