import { requestDeepSeekJson, type DeepSeekMessage } from "./deepseek-client";
import { getAiPrompt } from "./ai-prompts";
import {
  type GeneratedTopic,
  type WritingFeedback,
  type WritingPrompt,
  validateImitationPrompt,
  validateWritingFeedback,
} from "./writing-types";

export interface WritingContext {
  abilitySummary: string;
  abilityBand: string;
  declaredContext: unknown;
  goals: unknown;
  vocabularyEvidence: unknown;
}

export async function evaluateWriting(input: {
  text: string;
  prompt: WritingPrompt;
  focus: unknown;
  taskType: string;
  attemptNumber: number;
  context: WritingContext;
}): Promise<WritingFeedback> {
  const system = await getAiPrompt("writing.evaluate");
  const user = `学习者背景：${JSON.stringify(input.context)}
任务类型：${input.taskType}
任务要求：${JSON.stringify(input.prompt)}
本轮必须解决的训练点：${JSON.stringify(input.focus)}
这是第 ${input.attemptNumber} 次尝试。
<learner_text>\n${input.text}\n</learner_text>`;
  return requestDeepSeekJson<WritingFeedback>(
    "writing.evaluate",
    [{ role: "system", content: system }, { role: "user", content: user }],
    validateWritingFeedback,
    0.15,
  );
}

export async function generateTopics(context: WritingContext): Promise<GeneratedTopic[]> {
  const system = await getAiPrompt("writing.topics");
  const messages: DeepSeekMessage[] = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(context) },
  ];
  return requestDeepSeekJson("writing.topics", messages, (value) => {
    if (!Array.isArray(value) || value.length < 3) throw new Error("AI 未返回 3 个题目");
    return value.slice(0, 3).map((raw) => {
      if (!raw || typeof raw !== "object") throw new Error("题目格式错误");
      const item = raw as Record<string, unknown>;
      for (const field of ["title", "prompt", "genre", "length"]) if (typeof item[field] !== "string") throw new Error(`题目缺少 ${field}`);
      return { title: item.title as string, prompt: item.prompt as string, genre: item.genre as string, length: item.length as string };
    });
  }, 0.7);
}

export async function continueTranslationChat(input: {
  messages: { role: string; content: string }[];
  turn: number;
  context: WritingContext;
}): Promise<{ reply: string; ready: boolean; chineseSentences: string[] }> {
  const system = await getAiPrompt("writing.translation_chat");
  const messages: DeepSeekMessage[] = [
    { role: "system", content: system },
    { role: "user", content: `当前轮次 ${input.turn}/3，背景 ${JSON.stringify(input.context)}，对话 ${JSON.stringify(input.messages)}` },
  ];
  return requestDeepSeekJson("writing.translation_chat", messages, (value) => {
    if (!value || typeof value !== "object") throw new Error("聊天格式错误");
    const item = value as Record<string, unknown>;
    if (typeof item.reply !== "string" || typeof item.ready !== "boolean" || !Array.isArray(item.chineseSentences)) throw new Error("聊天字段不完整");
    return { reply: item.reply, ready: input.turn >= 3 ? true : item.ready, chineseSentences: item.chineseSentences.filter((x): x is string => typeof x === "string").slice(0, 3) };
  }, 0.4);
}

export async function generateImitation(context: WritingContext): Promise<WritingPrompt> {
  const system = await getAiPrompt("writing.imitation");
  return requestDeepSeekJson("writing.imitation", [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(context) },
  ], validateImitationPrompt, 0.5);
}

export async function generateTaskHints(
  prompt: WritingPrompt,
  context: WritingContext,
): Promise<{ keywords: string[]; frame: string; modelAnswer: string; guidedSteps: string[] }> {
  const system = await getAiPrompt("writing.task_hints");
  return requestDeepSeekJson("writing.task_hints", [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ prompt, context }) },
  ], (value) => {
    if (!value || typeof value !== "object") throw new Error("提示格式错误");
    const item = value as Record<string, unknown>;
    const strings = (input: unknown) => Array.isArray(input) ? input.filter((x): x is string => typeof x === "string") : [];
    if (typeof item.frame !== "string" || typeof item.modelAnswer !== "string") throw new Error("提示字段不完整");
    return { keywords: strings(item.keywords).slice(0, 8), frame: item.frame, modelAnswer: item.modelAnswer, guidedSteps: strings(item.guidedSteps).slice(0, 8) };
  }, 0.3);
}

export async function generateReviewPrompts(
  items: { id: string; category: string; summary: string; exampleBefore: string; exampleAfter: string }[],
  context: WritingContext,
): Promise<WritingPrompt[]> {
  const system = await getAiPrompt("writing.review_prompts");
  return requestDeepSeekJson("writing.review_prompts", [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ items, context }) },
  ], (value) => {
    // 模型偶尔返回的条数与错点数不一致：容错处理，有几条用几条（缺漏的错点会留到下次复练）
    if (!Array.isArray(value) || value.length === 0) throw new Error("复练题数量不符");
    return value.slice(0, items.length).map((raw, index) => {
      if (!raw || typeof raw !== "object") throw new Error("复练题格式错误");
      const item = raw as Record<string, unknown>;
      if (typeof item.instruction !== "string") throw new Error("复练题缺少要求");
      return {
        instruction: item.instruction,
        chinese: typeof item.chinese === "string" ? item.chinese : undefined,
        variation: typeof item.variation === "string" ? item.variation : undefined,
        memoryId: items[index].id,
      };
    });
  }, 0.45);
}
