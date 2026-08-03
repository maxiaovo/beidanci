import type { WritingFeedback } from "./writing-types";

export function needsLongerDiagnostic(feedbacks: WritingFeedback[], threshold = 0.75): boolean {
  if (feedbacks.length < 3) return true;
  const confidence = feedbacks.reduce((sum, item) => sum + item.confidence, 0) / feedbacks.length;
  return confidence < threshold || feedbacks.some((item) => item.needsLongerAssessment);
}
