import { advanceStage, nextReviewDate } from "@/lib/scheduler";

export type ProgressMode = "learn" | "check-spell" | "check-choice";
export type ProgressResult = "correct" | "wrong" | "giveup";

export interface ExistingProgress {
  stage: number;
  nextReviewAt: Date;
  spellPassed: boolean;
  choicePassed: boolean;
}

export interface ProgressDecision {
  stage: number;
  nextReviewAt: Date;
  spellPassed: boolean;
  choicePassed: boolean;
}

export function decideProgress({
  existing,
  mode,
  result,
  strict,
  hadFailure,
  recoveryPass = false,
  now = new Date(),
}: {
  existing: ExistingProgress | null;
  mode: ProgressMode;
  result: ProgressResult;
  strict: boolean;
  hadFailure: boolean;
  // 补考中间次（连对第 1、2 次）：只留学习记录，不推进任何进度；
  // 第 3 次连对由客户端按普通 correct 上报，走既有晋级逻辑
  recoveryPass?: boolean;
  now?: Date;
}): ProgressDecision {
  const correct = result === "correct";
  const currentStage = existing?.stage ?? 0;
  let spellPassed = existing?.spellPassed ?? false;
  let choicePassed = existing?.choicePassed ?? false;

  if (recoveryPass && correct && mode.startsWith("check")) {
    return {
      stage: currentStage,
      nextReviewAt: existing?.nextReviewAt ?? nextReviewDate(0, now),
      spellPassed,
      choicePassed,
    };
  }

  if (strict) {
    if (!correct) {
      return {
        stage: 0,
        nextReviewAt: nextReviewDate(0, now),
        spellPassed: false,
        choicePassed: false,
      };
    }

    if (mode === "check-spell") spellPassed = true;
    if (mode === "check-choice") choicePassed = true;
    if (!spellPassed || !choicePassed) {
      return {
        stage: currentStage,
        nextReviewAt: existing?.nextReviewAt ?? nextReviewDate(0, now),
        spellPassed,
        choicePassed,
      };
    }

    const stage = hadFailure ? 0 : advanceStage(currentStage, true);
    return {
      stage,
      nextReviewAt: nextReviewDate(stage, now),
      spellPassed: false,
      choicePassed: false,
    };
  }

  const isCorrectedReview = mode.startsWith("check") && correct && hadFailure;
  const stage = isCorrectedReview ? 0 : advanceStage(currentStage, correct);
  return {
    stage,
    nextReviewAt: nextReviewDate(stage, now),
    spellPassed: false,
    choicePassed: false,
  };
}
