import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, listChildUsers } from "@/lib/session";
import { getEffectiveDailyTargets } from "@/lib/settings";
import { getStudyStreak } from "@/lib/streak";

// 家长：孩子列表 + 学习统计（管理员等价于拥有全部学习者）
export async function GET() {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (viewer.role !== "parent" && viewer.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const children = await listChildUsers(viewer);
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const result = [];
  for (const u of children) {
    const [todayLogs, totalLogs, correctLogs, dueCount, learnedCount] = await Promise.all([
      prisma.studyLog.count({ where: { userId: u.id, createdAt: { gte: start } } }),
      prisma.studyLog.count({ where: { userId: u.id } }),
      prisma.studyLog.count({ where: { userId: u.id, result: "correct" } }),
      prisma.wordProgress.count({ where: { userId: u.id, nextReviewAt: { lte: new Date() } } }),
      prisma.wordProgress.count({ where: { userId: u.id } }),
    ]);
    // 连续学习天数
    const streak = await getStudyStreak(u.id);
    const targets = await getEffectiveDailyTargets(u);
    result.push({
      id: u.id,
      username: u.username,
      avatarUrl: u.avatarUrl,
      dailyNewTarget: targets.dailyNewTarget,
      dailyReviewTarget: targets.dailyReviewTarget,
      customDailyNewTarget: u.dailyNewTarget,
      customDailyReviewTarget: u.dailyReviewTarget,
      recoveryCorrectTarget: u.recoveryCorrectTarget,
      cyclicRecovery: u.cyclicRecovery,
      todayLogs,
      totalLogs,
      accuracy: totalLogs ? Math.round((correctLogs / totalLogs) * 100) : null,
      dueCount,
      learnedCount,
      streak,
    });
  }
  return NextResponse.json({ children: result });
}
