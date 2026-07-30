import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 家长留言管理：管理员给指定学习者留言
// trigger: start（开始学习时）| minutes（学习 N 分钟后）| word（学到第 N 个词）
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { userId, text, trigger } = body;
  if (typeof userId !== "string" || !userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "留言内容不能为空" }, { status: 400 });
  if (!["start", "minutes", "word"].includes(trigger)) {
    return NextResponse.json({ error: "非法触发方式" }, { status: 400 });
  }

  let triggerValue: number | null = null;
  if (trigger !== "start") {
    const v = Number(body.triggerValue);
    if (!Number.isInteger(v) || v < 1 || v > 9999) {
      return NextResponse.json({ error: trigger === "minutes" ? "分钟数需为 1-9999 的整数" : "词序需为 1-9999 的整数" }, { status: 400 });
    }
    triggerValue = v;
  }

  const validDays = Number(body.validDays ?? 7);
  if (!Number.isFinite(validDays) || validDays < 1 || validDays > 365) {
    return NextResponse.json({ error: "有效期需为 1-365 天" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

  const validUntil = new Date(Date.now() + validDays * 24 * 3600 * 1000);
  const msg = await prisma.message.create({
    data: { userId, text: text.trim(), trigger, triggerValue, validUntil },
  });
  return NextResponse.json({ ok: true, message: msg });
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await prisma.message.delete({ where: { id: body.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
