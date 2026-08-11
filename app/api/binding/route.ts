import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// 查询当前用户的绑定状态与邀约（家长/孩子通用）
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const isParentRole = me.role === "parent";
  const where = isParentRole ? { parentId: me.id } : { childId: me.id };

  const [invites, boundParent, boundChildren] = await Promise.all([
    prisma.bindingInvite.findMany({ where, orderBy: { createdAt: "desc" } }),
    !isParentRole && me.parentId
      ? prisma.user.findUnique({ where: { id: me.parentId }, select: { id: true, username: true } })
      : null,
    isParentRole
      ? prisma.user.findMany({ where: { parentId: me.id }, select: { id: true, username: true }, orderBy: { createdAt: "asc" } })
      : [],
  ]);

  // 邀约里的对方用户名
  const counterpartIds = invites.map((i) => (isParentRole ? i.childId : i.parentId));
  const counterparts = counterpartIds.length
    ? await prisma.user.findMany({ where: { id: { in: counterpartIds } }, select: { id: true, username: true } })
    : [];
  const nameOf = new Map(counterparts.map((u) => [u.id, u.username]));

  const decorate = (list: typeof invites, createdBy: string) =>
    list
      .filter((i) => i.createdBy === createdBy)
      .map((i) => ({
        id: i.id,
        username: nameOf.get(isParentRole ? i.childId : i.parentId) ?? "",
        createdAt: i.createdAt,
      }));

  return NextResponse.json({
    role: me.role,
    bound: isParentRole
      ? { children: boundChildren }
      : { parent: boundParent },
    outgoing: decorate(invites, isParentRole ? "parent" : "child"),
    incoming: decorate(invites, isParentRole ? "child" : "parent"),
  });
}
