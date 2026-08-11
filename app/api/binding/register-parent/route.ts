import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    // 检查+写入收进同一事务：事务内 re-check parentId 仍为空才绑定，挡住并发双请求
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUnique({ where: { id: me.id }, select: { parentId: true } });
      if (fresh?.parentId) throw new BoundConflict();
      await tx.user.create({ data: { username, passwordHash, role: "parent" } });
      await tx.user.update({ where: { id: me.id }, data: { parent: { connect: { username } } } });
    });
  } catch (e) {
    if (e instanceof BoundConflict) {
      return NextResponse.json({ error: "你已绑定家长，如需更换请先解绑" }, { status: 409 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // 并发下同用户名被抢先注册
      return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true, username });
}

class BoundConflict extends Error {
  constructor() {
    super("已绑定家长");
  }
}
