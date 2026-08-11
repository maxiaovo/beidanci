import { prisma } from "./db";

const BATCH = 500;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// 连续学习天数：从今天（今天还没学则从昨天）往回数，断签即停。
// 按 createdAt desc 分批取行（通常一批 500 条就够），不再全量拉取该用户的 StudyLog。
export async function getStudyStreak(userId: string): Promise<number> {
  const daySet = new Set<string>();
  let fetched = 0;
  for (;;) {
    const logs = await prisma.studyLog.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: fetched,
      take: BATCH,
    });
    for (const l of logs) daySet.add(l.createdAt.toDateString());
    fetched += logs.length;

    const cursor = new Date();
    if (!daySet.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (daySet.has(cursor.toDateString())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    // cursor 现指向断签日：已取到的最早日志早于断签日开始，则断签确凿，可以返回
    const oldest = logs[logs.length - 1]?.createdAt;
    if (logs.length < BATCH || !oldest || oldest < startOfDay(cursor)) return streak;
  }
}
