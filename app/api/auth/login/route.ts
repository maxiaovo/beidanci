import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/session";

// 登录失败限流：内存滑动窗口，按 IP+username 计 10 分钟内 10 次失败（单实例够用）
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map<string, number[]>();

function rateKey(req: Request, username: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `${ip}|${username.toLowerCase()}`;
}

function prune(now: number) {
  // 顺带清理过期记录，防止 Map 无界增长
  for (const [key, list] of failures) {
    const kept = list.filter((t) => now - t < WINDOW_MS);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
  }
}

function isLimited(key: string, now: number): boolean {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  if (failures.size > 500) prune(now);
  return list.length >= MAX_FAILURES;
}

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const name = String(username ?? "");
  const key = rateKey(req, name);
  const now = Date.now();
  if (isLimited(key, now)) {
    return NextResponse.json({ error: "尝试次数过多，请 10 分钟后再试" }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { username: name } });
  const ok = user ? await bcrypt.compare(String(password ?? ""), user.passwordHash) : false;
  if (!user || !ok) {
    failures.set(key, [...(failures.get(key) ?? []), now]);
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }
  failures.delete(key);
  await createSession(user.id);
  return NextResponse.json({ ok: true, username: user.username, role: user.role });
}
