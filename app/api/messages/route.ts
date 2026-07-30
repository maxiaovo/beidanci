import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

// 当前登录用户的有效留言（家长留言），按创建时间升序
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const messages = await prisma.message.findMany({
    where: { userId: user.id, validUntil: { gte: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true, text: true, trigger: true, triggerValue: true },
  });
  return NextResponse.json({ messages });
}
