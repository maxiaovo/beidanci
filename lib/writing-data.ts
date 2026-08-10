import { prisma } from "./db";
import { isAllowSkipReview } from "./settings";
import type { WritingContext } from "./writing-ai";
import { parseJson, type WritingFeedback, type WritingPrompt } from "./writing-types";
import { startOfLocalDay } from "./writing-scheduler";

export async function getVocabularyEvidence(userId: string) {
  const [learned, strong, weak, samples] = await Promise.all([
    prisma.wordProgress.count({ where: { userId } }),
    prisma.wordProgress.count({ where: { userId, stage: { gte: 4 } } }),
    prisma.wordProgress.count({ where: { userId, lapses: { gte: 2 } } }),
    prisma.wordProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { stage: true, lapses: true, word: { select: { text: true } } },
    }),
  ]);
  return {
    learned,
    strong,
    weak,
    recentStrongWords: samples.filter((item) => item.stage >= 4).slice(0, 12).map((item) => item.word.text),
    recentWeakWords: samples.filter((item) => item.lapses >= 2).slice(0, 12).map((item) => item.word.text),
    note: "背词数据只作为弱证据，实际写作表现优先",
  };
}

export async function getWritingContext(userId: string): Promise<WritingContext> {
  const [profile, vocabularyEvidence] = await Promise.all([
    prisma.writingProfile.findUnique({ where: { userId } }),
    getVocabularyEvidence(userId),
  ]);
  return {
    abilitySummary: profile?.abilitySummary || "尚未完成写作评估，从简单、实用的日常表达开始",
    abilityBand: profile?.abilityBand || "",
    declaredContext: parseJson(profile?.declaredContext ?? "{}", {}),
    goals: parseJson(profile?.goals ?? "{}", {}),
    vocabularyEvidence,
  };
}

function visibleFeedback(text: string, hintLevel: number, revealAll: boolean): WritingFeedback | Record<string, unknown> {
  const feedback = parseJson<WritingFeedback | Record<string, unknown>>(text, {});
  if (revealAll || !("hints" in feedback)) return feedback;
  const copy = structuredClone(feedback) as WritingFeedback;
  copy.hints = {
    keywords: hintLevel >= 1 ? copy.hints.keywords : [],
    frame: hintLevel >= 2 ? copy.hints.frame : "",
    guidedSteps: hintLevel >= 3 ? copy.hints.guidedSteps : [],
  };
  if (hintLevel < 3) copy.modelAnswer = "";
  return copy;
}

export async function getWritingSessionForViewer(sessionId: string, userId: string, revealAll = false) {
  const session = await prisma.writingSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: { orderIndex: "asc" }, include: { attempts: { orderBy: { version: "asc" } } } },
    },
  });
  if (!session) return null;
  return {
    ...session,
    target: parseJson(session.target, {}),
    tasks: session.tasks.map((task) => ({
      ...task,
      prompt: parseJson<WritingPrompt>(task.prompt, { instruction: "" }),
      focus: parseJson(task.focus, []),
      attempts: task.attempts.map((attempt) => ({
        ...attempt,
        feedback: visibleFeedback(attempt.feedback, task.hintLevel, revealAll),
      })),
    })),
  };
}

export async function getWritingOverview(userId: string) {
  const today = startOfLocalDay();
  const [profile, activeReview, completedReviewToday, dueTotal, activeSession, recent, skippedToday, allowSkipReview] = await Promise.all([
    prisma.writingProfile.findUnique({ where: { userId } }),
    prisma.writingSession.findFirst({
      where: { userId, kind: "review", status: "active" },
      orderBy: { createdAt: "asc" },
      include: { tasks: { where: { status: "active" }, select: { id: true } } },
    }),
    prisma.writingSession.count({ where: { userId, kind: "review", status: "completed", completedAt: { gte: today } } }),
    prisma.writingMemoryItem.count({ where: { userId, status: "active", nextReviewAt: { lte: new Date() } } }),
    prisma.writingSession.findFirst({
      where: { userId, status: "active", kind: { not: "review" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, mode: true, updatedAt: true },
    }),
    prisma.writingSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { id: true, title: true, mode: true, kind: true, status: true, updatedAt: true, completedAt: true },
    }),
    // 当天已跳过写作复练（留痕在 reviewSkip，module="writing"）
    prisma.reviewSkip.count({ where: { userId, module: "writing", createdAt: { gte: today } } }),
    isAllowSkipReview(),
  ]);
  const reviewRequired = skippedToday === 0 && (!!activeReview || (dueTotal > 0 && completedReviewToday === 0));
  return {
    profile: profile
      ? {
          ...profile,
          declaredContext: parseJson(profile.declaredContext, {}),
          goals: parseJson(profile.goals, {}),
          dimensions: parseJson(profile.dimensions, {}),
          strengths: parseJson(profile.strengths, []),
          weaknesses: parseJson(profile.weaknesses, []),
          evidence: parseJson(profile.evidence, []),
        }
      : null,
    review: {
      required: reviewRequired,
      dueTotal,
      todayCount: activeReview?.tasks.length ?? (reviewRequired ? Math.min(5, dueTotal) : 0),
      sessionId: activeReview?.id ?? null,
      allowSkip: allowSkipReview,
    },
    activeSession,
    recent,
  };
}

export async function recalculateWritingProfile(userId: string) {
  const existing = await prisma.writingProfile.findUnique({ where: { userId } });
  if (!existing) return null;
  const [attempts, completedTasks, diagnosticDone, diagnosticActive] = await Promise.all([
    prisma.writingAttempt.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { feedback: true } }),
    prisma.writingTask.count({ where: { session: { userId }, status: "passed" } }),
    prisma.writingSession.count({ where: { userId, kind: "diagnostic", status: "completed" } }),
    prisma.writingSession.count({ where: { userId, kind: "diagnostic", status: "active" } }),
  ]);
  const feedbacks = attempts.map((attempt) => parseJson<WritingFeedback | null>(attempt.feedback, null)).filter((item): item is WritingFeedback => !!item?.dimensions);
  if (!feedbacks.length) {
    return prisma.writingProfile.update({
      where: { userId },
      data: {
        abilityBand: "",
        abilitySummary: "尚未完成写作评估，从简单、实用的日常表达开始",
        dimensions: "{}",
        strengths: "[]",
        weaknesses: "[]",
        evidence: "[]",
        completedTasks: 0,
        assessmentStatus: "provisional",
        lastAssessedAt: null,
      },
    });
  }
  const keys = ["grammar", "vocabulary", "naturalness", "clarity", "register"] as const;
  const dimensions = Object.fromEntries(keys.map((key) => [key, Math.round((feedbacks.reduce((sum, item) => sum + item.dimensions[key], 0) / feedbacks.length) * 10) / 10]));
  const unique = (items: string[]) => [...new Set(items.filter(Boolean))].slice(0, 8);
  const strengths = unique(feedbacks.flatMap((item) => item.strengths));
  const weaknesses = unique(feedbacks.flatMap((item) => item.issues.filter((issue) => issue.severity !== "suggestion").map((issue) => issue.explanation)));
  const status = diagnosticActive === 0 && (diagnosticDone > 0 || completedTasks >= 3) ? "assessed" : "provisional";
  return prisma.writingProfile.update({
    where: { userId },
    data: {
      abilityBand: feedbacks[0].band,
      abilitySummary: feedbacks[0].capability,
      dimensions: JSON.stringify(dimensions),
      strengths: JSON.stringify(strengths),
      weaknesses: JSON.stringify(weaknesses),
      evidence: JSON.stringify(feedbacks.slice(0, 5).map((item) => ({ summary: item.summary, confidence: item.confidence }))),
      completedTasks,
      assessmentStatus: status,
      lastAssessedAt: new Date(),
    },
  });
}

export function buildGuidedPrompt(feedback: WritingFeedback): string {
  if (feedback.hints.guidedSteps.length) return feedback.hints.guidedSteps.join("\n");
  return `先按这个句型逐部分重建：${feedback.hints.frame || feedback.improvedVersion}`;
}
