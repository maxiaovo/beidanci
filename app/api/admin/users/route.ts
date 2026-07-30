import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 管理员：用户列表 + 学习统计
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const result = [];
  for (const u of users) {
    const [todayLogs, totalLogs, correctLogs, dueCount, learnedCount] = await Promise.all([
      prisma.studyLog.count({ where: { userId: u.id, createdAt: { gte: start } } }),
      prisma.studyLog.count({ where: { userId: u.id } }),
      prisma.studyLog.count({ where: { userId: u.id, result: "correct" } }),
      prisma.wordProgress.count({ where: { userId: u.id, nextReviewAt: { lte: new Date() } } }),
      prisma.wordProgress.count({ where: { userId: u.id } }),
    ]);
    // 连续学习天数
    const days = await prisma.studyLog.findMany({
      where: { userId: u.id },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const daySet = new Set(days.map((d) => d.createdAt.toDateString()));
    let streak = 0;
    const cursor = new Date();
    if (!daySet.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (daySet.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    result.push({
      id: u.id,
      username: u.username,
      role: u.role,
      parentId: u.parentId,
      avatarUrl: u.avatarUrl,
      dailyNewTarget: u.dailyNewTarget,
      dailyReviewTarget: u.dailyReviewTarget,
      highlightColor: u.highlightColor,
      todayLogs,
      totalLogs,
      accuracy: totalLogs ? Math.round((correctLogs / totalLogs) * 100) : null,
      dueCount,
      learnedCount,
      streak,
    });
  }
  return NextResponse.json({ users: result });
}

// 管理员创建用户
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { username, password, role } = await req.json().catch(() => ({}));
  if (!username || String(username).trim().length < 2) {
    return NextResponse.json({ error: "用户名至少2位" }, { status: 400 });
  }
  if (!password || String(password).length < 4) {
    return NextResponse.json({ error: "密码至少4位" }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { username: String(username).trim() } });
  if (existing) {
    return NextResponse.json({ error: "用户名已被占用" }, { status: 409 });
  }
  const bcrypt = (await import("bcryptjs")).default;
  await prisma.user.create({
    data: {
      username: String(username).trim(),
      passwordHash: bcrypt.hashSync(String(password), 10),
      role: ["admin", "parent"].includes(role) ? role : "user",
    },
  });
  return NextResponse.json({ ok: true });
}
