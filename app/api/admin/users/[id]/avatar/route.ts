import { NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";
import { saveAvatar, findAvatarFile } from "@/lib/avatars";

// 管理员修改指定用户头像（multipart）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const avatar = form?.get("avatar") as File | null;
  if (!avatar || avatar.size === 0) {
    return NextResponse.json({ error: "请选择头像图片" }, { status: 400 });
  }
  try {
    if (target.avatarUrl) {
      const old = findAvatarFile(target.avatarUrl);
      if (old) fs.unlinkSync(old);
    }
    const avatarUrl = await saveAvatar(target.id, avatar);
    await prisma.user.update({ where: { id: target.id }, data: { avatarUrl } });
    return NextResponse.json({ ok: true, avatarUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
