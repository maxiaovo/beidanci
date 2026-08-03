import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "清空全部写作数据") return NextResponse.json({ error: "需要明确确认" }, { status: 400 });
  await prisma.$transaction([
    prisma.writingSession.deleteMany({ where: { userId: user.id } }),
    prisma.writingProfile.deleteMany({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
