export const WRITING_REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;

export interface WritingReviewDecision {
  stage: number;
  reps: number;
  lapses: number;
  status: "active" | "mastered";
  nextReviewAt: Date;
}

export function decideWritingReview(
  current: { stage: number; reps: number; lapses: number },
  passed: boolean,
  clean: boolean,
  now = new Date(),
): WritingReviewDecision {
  let stage = current.stage;
  let lapses = current.lapses;
  let reps = current.reps;
  if (passed && clean) {
    reps += 1;
    stage += 1;
  } else {
    if (!passed) lapses += 1;
    stage = 0;
  }
  const mastered = stage >= WRITING_REVIEW_INTERVALS.length;
  const interval = mastered ? WRITING_REVIEW_INTERVALS.at(-1)! : WRITING_REVIEW_INTERVALS[Math.max(0, stage)];
  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(nextReviewAt.getDate() + interval);
  return { stage, reps, lapses, status: mastered ? "mastered" : "active", nextReviewAt };
}

export function startOfLocalDay(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}
