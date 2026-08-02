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
  now = new Date(),
}: {
  existing: ExistingProgress | null;
  mode: ProgressMode;
  result: ProgressResult;
  strict: boolean;
  hadFailure: boolean;
  now?: Date;
}): ProgressDecision {
  const correct = result === "correct";
  const currentStage = existing?.stage ?? 0;
  let spellPassed = existing?.spellPassed ?? false;
  let choicePassed = existing?.choicePassed ?? false;

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
