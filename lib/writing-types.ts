export const WRITING_CATEGORIES = [
  "grammar",
  "vocabulary",
  "naturalness",
  "clarity",
  "register",
  "spelling",
  "structure",
] as const;

export type WritingCategory = (typeof WRITING_CATEGORIES)[number];
export type WritingDimensions = Record<"grammar" | "vocabulary" | "naturalness" | "clarity" | "register", number>;

export interface WritingIssue {
  category: WritingCategory;
  severity: "blocking" | "important" | "suggestion";
  original: string;
  correction: string;
  explanation: string;
  skillCode: string;
}

export interface WritingMemorySuggestion {
  category: WritingCategory;
  skillCode: string;
  summary: string;
  explanation: string;
  exampleBefore: string;
  exampleAfter: string;
}

export interface WritingFeedback {
  summary: string;
  capability: string;
  band: string;
  confidence: number;
  dimensions: WritingDimensions;
  strengths: string[];
  issues: WritingIssue[];
  blockingIssues: string[];
  focusResolved: boolean;
  improvedVersion: string;
  modelAnswer: string;
  hints: { keywords: string[]; frame: string; guidedSteps: string[] };
  memoryItems: WritingMemorySuggestion[];
  needsLongerAssessment: boolean;
}

export interface BilingualTeachingText {
  en: string;
  zh: string;
}

export interface WritingPrewritingGuide {
  coach: BilingualTeachingText;
  goal: BilingualTeachingText;
  steps: BilingualTeachingText[];
  checklist: BilingualTeachingText[];
}

export interface WritingModelSentence {
  english: string;
  translationZh: string;
  role: BilingualTeachingText;
  explanation: BilingualTeachingText;
  pattern: string;
  patternZh?: string;
  pitfall: BilingualTeachingText;
}

export interface WritingPrompt {
  instruction: string;
  chinese?: string;
  example?: string;
  variation?: string;
  length?: string;
  memoryId?: string;
  help?: { keywords: string[]; frame: string; modelAnswer: string; guidedSteps: string[] };
  prewriting?: WritingPrewritingGuide;
  model?: { sentences: WritingModelSentence[] };
}

export interface GeneratedTopic {
  title: string;
  prompt: string;
  genre: string;
  length: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI JSON 不是对象");
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`AI JSON 缺少 ${field}`);
  return value.trim();
}

function requiredString(value: unknown, field: string): string {
  const result = string(value, field);
  if (!result) throw new Error(`AI JSON 的 ${field} 不能为空`);
  return result;
}

function bilingual(value: unknown, field: string): BilingualTeachingText {
  const item = record(value);
  return {
    en: requiredString(item.en, `${field}.en`),
    zh: requiredString(item.zh, `${field}.zh`),
  };
}

function bilingualArray(value: unknown, field: string, min: number, max: number): BilingualTeachingText[] {
  if (!Array.isArray(value)) throw new Error(`AI JSON 缺少 ${field}`);
  const result = value.slice(0, max).map((item, index) => bilingual(item, `${field}[${index}]`));
  if (result.length < min) throw new Error(`AI JSON 的 ${field} 至少需要 ${min} 项`);
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function score(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

export function validateImitationPrompt(value: unknown): WritingPrompt {
  const root = record(value);
  const prewriting = record(root.prewriting);
  const model = record(root.model);
  if (!Array.isArray(model.sentences) || model.sentences.length === 0) {
    throw new Error("仿写教学包缺少示范句");
  }
  const sentences = model.sentences.slice(0, 12).map((raw, index) => {
    const item = record(raw);
    return {
      english: requiredString(item.english, `model.sentences[${index}].english`),
      translationZh: requiredString(item.translationZh, `model.sentences[${index}].translationZh`),
      role: bilingual(item.role, `model.sentences[${index}].role`),
      explanation: bilingual(item.explanation, `model.sentences[${index}].explanation`),
      pattern: requiredString(item.pattern, `model.sentences[${index}].pattern`),
      patternZh: typeof item.patternZh === "string" && item.patternZh.trim() ? item.patternZh.trim() : undefined,
      pitfall: bilingual(item.pitfall, `model.sentences[${index}].pitfall`),
    };
  });
  return {
    instruction: requiredString(root.instruction, "instruction"),
    variation: requiredString(root.variation, "variation"),
    example: sentences.map((sentence) => sentence.english).join(" "),
    prewriting: {
      coach: bilingual(prewriting.coach, "prewriting.coach"),
      goal: bilingual(prewriting.goal, "prewriting.goal"),
      steps: bilingualArray(prewriting.steps, "prewriting.steps", 2, 4),
      checklist: bilingualArray(prewriting.checklist, "prewriting.checklist", 2, 4),
    },
    model: { sentences },
  };
}

export function validateWritingFeedback(value: unknown): WritingFeedback {
  const root = record(value);
  const dimensions = record(root.dimensions);
  const issues = Array.isArray(root.issues)
    ? root.issues.slice(0, 12).map((raw) => {
        const item = record(raw);
        const category = string(item.category, "issues.category") as WritingCategory;
        if (!WRITING_CATEGORIES.includes(category)) throw new Error(`未知问题类别 ${category}`);
        const severity = string(item.severity, "issues.severity") as WritingIssue["severity"];
        if (!["blocking", "important", "suggestion"].includes(severity)) throw new Error(`未知严重度 ${severity}`);
        return {
          category,
          severity,
          original: string(item.original ?? "", "issues.original"),
          correction: string(item.correction ?? "", "issues.correction"),
          explanation: string(item.explanation, "issues.explanation"),
          skillCode: string(item.skillCode, "issues.skillCode").slice(0, 80),
        };
      })
    : [];
  const memoryItems = Array.isArray(root.memoryItems)
    ? root.memoryItems.slice(0, 3).map((raw) => {
        const item = record(raw);
        const category = string(item.category, "memoryItems.category") as WritingCategory;
        if (!WRITING_CATEGORIES.includes(category)) throw new Error(`未知记忆类别 ${category}`);
        return {
          category,
          skillCode: string(item.skillCode, "memoryItems.skillCode").slice(0, 80),
          summary: string(item.summary, "memoryItems.summary"),
          explanation: string(item.explanation ?? "", "memoryItems.explanation"),
          exampleBefore: string(item.exampleBefore ?? "", "memoryItems.exampleBefore"),
          exampleAfter: string(item.exampleAfter ?? "", "memoryItems.exampleAfter"),
        };
      })
    : [];
  const hints = record(root.hints ?? {});
  const confidence = typeof root.confidence === "number" ? root.confidence : Number(root.confidence ?? 0.5);
  return {
    summary: string(root.summary, "summary"),
    capability: string(root.capability, "capability"),
    band: string(root.band ?? "", "band"),
    confidence: Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0.5)),
    dimensions: {
      grammar: score(dimensions.grammar),
      vocabulary: score(dimensions.vocabulary),
      naturalness: score(dimensions.naturalness),
      clarity: score(dimensions.clarity),
      register: score(dimensions.register),
    },
    strengths: stringArray(root.strengths).slice(0, 5),
    issues,
    blockingIssues: stringArray(root.blockingIssues).slice(0, 3),
    focusResolved: root.focusResolved === true,
    improvedVersion: string(root.improvedVersion ?? "", "improvedVersion"),
    modelAnswer: string(root.modelAnswer ?? "", "modelAnswer"),
    hints: {
      keywords: stringArray(hints.keywords).slice(0, 8),
      frame: string(hints.frame ?? "", "hints.frame"),
      guidedSteps: stringArray(hints.guidedSteps).slice(0, 8),
    },
    memoryItems,
    needsLongerAssessment: root.needsLongerAssessment === true,
  };
}

export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
