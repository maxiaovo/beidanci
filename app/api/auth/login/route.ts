import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const user = await prisma.user.findUnique({ where: { username: String(username ?? "") } });
  if (!user || !bcrypt.compareSync(String(password ?? ""), user.passwordHash)) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true, username: user.username, role: user.role });
}
