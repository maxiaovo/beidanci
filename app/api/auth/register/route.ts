import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";
import { isRegistrationOpen } from "@/lib/settings";
import { saveAvatar } from "@/lib/avatars";

export async function POST(req: Request) {
  if (!(await isRegistrationOpen())) {
    return NextResponse.json({ error: "注册已关闭，请联系管理员开通账号" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const avatar = form.get("avatar") as File | null;

  if (username.length < 2) {
    return NextResponse.json({ error: "用户名至少2位" }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
  }
  if (!avatar || avatar.size === 0) {
    return NextResponse.json({ error: "请上传头像" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { username, passwordHash: bcrypt.hashSync(password, 10) },
  });

  try {
    const avatarUrl = await saveAvatar(user.id, avatar);
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
  } catch (e) {
    await prisma.user.delete({ where: { id: user.id } });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true, username: user.username, role: user.role });
}
