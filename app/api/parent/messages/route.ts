import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessChild } from "@/lib/session";

// 家长留言：家长给自己的孩子留言（管理员拥有同等权限）
// trigger: start（开始学习时）| minutes（学习 N 分钟后）| word（学到第 N 个词）
export async function GET(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  if (!(await canAccessChild(viewer, userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ messages });
}

export async function POST(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { userId, text, trigger } = body;
  if (typeof userId !== "string" || !userId) return NextResponse.json({ error: "缺少 userId" }, { status: 400 });
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "留言内容不能为空" }, { status: 400 });
  if (!["start", "minutes", "word"].includes(trigger)) {
    return NextResponse.json({ error: "非法触发方式" }, { status: 400 });
  }
  if (!(await canAccessChild(viewer, userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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

  const validUntil = new Date(Date.now() + validDays * 24 * 3600 * 1000);
  const msg = await prisma.message.create({
    data: { userId, text: text.trim(), trigger, triggerValue, validUntil },
  });
  return NextResponse.json({ ok: true, message: msg });
}

export async function DELETE(req: Request) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });

  // 只能删除发给自己孩子的留言（管理员不限）
  const msg = await prisma.message.findUnique({ where: { id: body.id }, select: { userId: true } });
  if (!msg) return NextResponse.json({ error: "留言不存在或已删除" }, { status: 404 });
  if (!(await canAccessChild(viewer, msg.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
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
