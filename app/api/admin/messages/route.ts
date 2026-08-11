import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";

// 未登录 401 / 已登录但非管理员 403
function adminDenied(e: unknown) {
  const status = e instanceof AuthError ? e.status : 403;
  return NextResponse.json({ error: status === 401 ? "未登录" : "无权限" }, { status });
}

// 家长留言管理：管理员给指定学习者留言
// trigger: start（开始学习时）| minutes（学习 N 分钟后）| word（学到第 N 个词）
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    return adminDenied(e);
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
  } catch (e) {
    return adminDenied(e);
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
  } catch (e) {
    return adminDenied(e);
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  try {
    await prisma.message.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "留言不存在或已删除" }, { status: 404 });
    }
    console.error("删除留言失败:", e);
    return NextResponse.json({ error: "删除失败，请稍后重试" }, { status: 500 });
  }
}
