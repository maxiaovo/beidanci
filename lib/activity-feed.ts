// 顶栏"谁在学什么"播报：把学习/检查记录和写作会话汇总成每个成员的最新动态。
// 纯函数，供 /api/activity/now 使用，可单测。

export const LIVE_WINDOW_MS = 30 * 60 * 1000; // 30 分钟内算"正在学"

export interface ActivityLogInput {
  userId: string;
  username: string;
  avatarUrl: string | null;
  mode: string; // learn | check-spell | check-choice
  bookName: string;
  unitTitle: string;
  at: Date;
}

export interface ActivitySessionInput {
  userId: string;
  username: string;
  avatarUrl: string | null;
  title: string;
  at: Date;
}

export interface ActivityItem {
  userId: string;
  username: string;
  avatarUrl: string | null;
  action: string;
  detail: string;
  live: boolean;
  at: Date;
}

const LOG_LABEL: Record<string, { live: string; past: string }> = {
  learn: { live: "正在背单词", past: "刚才背了单词" },
  "check-spell": { live: "正在拼写检查", past: "刚才做了拼写检查" },
  "check-choice": { live: "正在选择检查", past: "刚才做了选择检查" },
};

export function buildActivityItems(
  logs: ActivityLogInput[],
  sessions: ActivitySessionInput[],
  now: Date = new Date(),
): ActivityItem[] {
  const cutoff = now.getTime() - LIVE_WINDOW_MS;
  const byUser = new Map<string, ActivityItem>();

  function keep(item: ActivityItem) {
    const existing = byUser.get(item.userId);
    if (!existing || item.at > existing.at) byUser.set(item.userId, item);
  }

  for (const log of logs) {
    const live = log.at.getTime() >= cutoff;
    const label = LOG_LABEL[log.mode] ?? LOG_LABEL.learn;
    keep({
      userId: log.userId,
      username: log.username,
      avatarUrl: log.avatarUrl,
      action: live ? label.live : label.past,
      detail: log.mode === "learn" ? `《${log.bookName}》· ${log.unitTitle}` : `《${log.bookName}》`,
      live,
      at: log.at,
    });
  }

  for (const session of sessions) {
    const live = session.at.getTime() >= cutoff;
    keep({
      userId: session.userId,
      username: session.username,
      avatarUrl: session.avatarUrl,
      action: live ? "正在写作" : "刚才练了写作",
      detail: session.title || "自由写作",
      live,
      at: session.at,
    });
  }

  return [...byUser.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}
