import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { expectedTargetRole, matchInvite } from "@/lib/binding";

// 发出绑定邀约：家长输入孩子用户名，或孩子输入家长用户名。
// 双方邀约互相匹配时立即完成绑定。
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const targetRole = expectedTargetRole(me.role);
  if (!targetRole) {
    return NextResponse.json({ error: "管理员请在管理后台进行绑定操作" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  if (!username) return NextResponse.json({ error: "请输入对方用户名" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  if (target.id === me.id) return NextResponse.json({ error: "不能绑定自己" }, { status: 400 });
  if (target.role !== targetRole) {
    return NextResponse.json(
      { error: me.role === "parent" ? "对方不是学生账号" : "对方不是家长账号" },
      { status: 400 }
    );
  }

  const parentId = me.role === "parent" ? me.id : target.id;
  const childId = me.role === "parent" ? target.id : me.id;
  const createdBy = me.role === "parent" ? "parent" : "child";

  const child = await prisma.user.findUnique({ where: { id: childId }, select: { parentId: true } });
  if (child?.parentId === parentId) {
    return NextResponse.json({ error: "你们已经绑定过了" }, { status: 409 });
  }
  if (child?.parentId) {
    return NextResponse.json({ error: "该孩子已绑定其他家长，请先解绑" }, { status: 409 });
  }

  const existing = await prisma.bindingInvite.findMany({ where: { parentId, childId } });
  if (existing.some((i) => i.createdBy === createdBy)) {
    return NextResponse.json({ error: "邀约已发出，等待对方操作" }, { status: 409 });
  }

  const matched = matchInvite(existing, { parentId, childId, createdBy });
  if (matched) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: childId }, data: { parentId } }),
      // 绑定完成后清理该孩子的所有待匹配邀约
      prisma.bindingInvite.deleteMany({ where: { childId } }),
    ]);
    return NextResponse.json({ matched: true, username: target.username });
  }

  await prisma.bindingInvite.create({ data: { parentId, childId, createdBy } });
  return NextResponse.json({ matched: false, username: target.username });
}
