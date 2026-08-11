import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// 学生登录后自助注册家长账号：创建 role=parent 用户并自动绑定到自己
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (me.role !== "user") {
    return NextResponse.json({ error: "只有学生账号可以注册家长" }, { status: 403 });
  }
  if (me.parentId) {
    return NextResponse.json({ error: "你已绑定家长，如需更换请先解绑" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (username.length < 2) return NextResponse.json({ error: "用户名至少2位" }, { status: 400 });
  if (password.length < 4) return NextResponse.json({ error: "密码至少4位" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });

  await prisma.$transaction([
    prisma.user.create({
      data: { username, passwordHash: bcrypt.hashSync(password, 10), role: "parent" },
    }),
    prisma.user.update({ where: { id: me.id }, data: { parent: { connect: { username } } } }),
  ]);
  return NextResponse.json({ ok: true, username });
}
