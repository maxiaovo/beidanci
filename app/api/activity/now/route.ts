import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { buildActivityItems, LIVE_WINDOW_MS, type ActivityLogInput, type ActivitySessionInput } from "@/lib/activity-feed";

// 顶栏播报条数据：最近 30 分钟内"正在学"的成员动态；窗口内无人则回退到今天最近一次
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const now = new Date();
  const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  async function fetchLogs(since: Date) {
    const rows = await prisma.studyLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, username: true, avatarUrl: true } },
        word: { include: { unit: { include: { book: true } } } },
      },
    });
    return rows.map((row): ActivityLogInput => ({
      userId: row.user.id,
      username: row.user.username,
      avatarUrl: row.user.avatarUrl,
      mode: row.mode,
      bookName: row.word.unit.book.name,
      unitTitle: row.word.unit.title,
      at: row.createdAt,
    }));
  }

  async function fetchSessions(since: Date) {
    const rows = await prisma.writingSession.findMany({
      where: { status: "active", updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
    return rows.map((row): ActivitySessionInput => ({
      userId: row.user.id,
      username: row.user.username,
      avatarUrl: row.user.avatarUrl,
      title: row.title,
      at: row.updatedAt,
    }));
  }

  let logs = await fetchLogs(liveSince);
  let sessions = await fetchSessions(liveSince);
  if (logs.length === 0 && sessions.length === 0) {
    [logs, sessions] = await Promise.all([fetchLogs(dayStart), fetchSessions(dayStart)]);
  }

  return NextResponse.json({ items: buildActivityItems(logs, sessions, now) });
}
