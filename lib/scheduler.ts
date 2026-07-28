// 艾宾浩斯复习阶梯：stage -> 距下次复习的毫秒数
const STAGE_INTERVALS = [
  10 * 60 * 1000, // stage 0 -> 10 分钟
  24 * 3600 * 1000, // 1 天
  2 * 24 * 3600 * 1000, // 2 天
  4 * 24 * 3600 * 1000, // 4 天
  7 * 24 * 3600 * 1000, // 7 天
  15 * 24 * 3600 * 1000,
  30 * 24 * 3600 * 1000,
  60 * 24 * 3600 * 1000,
];

export const MAX_STAGE = STAGE_INTERVALS.length; // 8 = 已掌握

export function nextReviewDate(stage: number, from = new Date()): Date {
  const idx = Math.min(Math.max(stage, 0), STAGE_INTERVALS.length - 1);
  return new Date(from.getTime() + STAGE_INTERVALS[idx]);
}

// 答对：升一级；答错/放弃：降回 stage 0（10 分钟后再见）
export function advanceStage(stage: number, correct: boolean): number {
  if (correct) return Math.min(stage + 1, MAX_STAGE);
  return 0;
}
