// 复习门禁：到期复习清空，或今日已完成复习配额，才放行新词
export function isReviewGateOpen(dueCount: number, reviewsDoneToday: number, dailyReviewTarget: number): boolean {
  return dueCount === 0 || reviewsDoneToday >= dailyReviewTarget;
}
