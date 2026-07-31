// 站点级设置（存 Setting 表）
import { prisma } from "./db";
import {
  DEFAULT_APPEARANCE,
  clampAppearanceValue,
  type LearnAppearance,
} from "./appearance";

export type { LearnAppearance };

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isRegistrationOpen(): Promise<boolean> {
  return (await getSetting("registration_open", "true")) === "true";
}

// 强检查：开启后只有拼写检查和选择检查都答对，单词才算检查通过
export async function isStrictCheck(): Promise<boolean> {
  return (await getSetting("strict_check", "false")) === "true";
}

// 允许跳过复习：开启后学习者可跳过当天复习门禁（留痕给管理员看）
export async function isAllowSkipReview(): Promise<boolean> {
  return (await getSetting("allow_skip_review", "false")) === "true";
}

// ---- 学习页外观（全局，管理员统一配置；字段定义见 lib/appearance.ts）----
// learnAppearance 各字段对应的 Setting 表 key
export const APPEARANCE_SETTING_KEYS: Record<keyof LearnAppearance, string> = {
  wordSizePx: "learn_word_size_px",
  segmentSizePx: "learn_segment_size_px",
  sentenceSizePx: "learn_sentence_size_px",
  sentenceCnSizePx: "learn_sentence_cn_size_px",
  cardWidthPct: "learn_card_width_pct",
};

export async function getLearnAppearance(): Promise<LearnAppearance> {
  const keys = Object.values(APPEARANCE_SETTING_KEYS);
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  const out = { ...DEFAULT_APPEARANCE };
  for (const [field, settingKey] of Object.entries(APPEARANCE_SETTING_KEYS) as [keyof LearnAppearance, string][]) {
    out[field] = clampAppearanceValue(field, s[settingKey]);
  }
  return out;
}

// ---- 站点信息 ----
export const DEFAULT_SITE_TITLE = "背单词";

export async function getSiteTitle(): Promise<string> {
  return (await getSetting("site_title")) || DEFAULT_SITE_TITLE;
}

// ---- AI 解析配置（Setting 表 > 环境变量 > 默认值）----
export const DEFAULT_AI_MODEL = "deepseek-v4-flash";
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";

export const DEFAULT_AI_PROMPT = `你是英语词汇教学专家。下面是某课程单元的原始词汇文本，可能格式杂乱。
请提取每一个单词/词组，输出严格的 JSON 数组（不要输出任何其他文字、不要用 markdown 代码块），每个元素字段如下：
- text: 单词原形（小写，词组保留空格）
- phonetic: 英式音标，带斜杠，如 /ˈæn.θər/
- pos: 词性缩写，如 n. v. adj. phrase
- meaningCn: 中文释义（简明，多个义项用；分隔）
- meaningEn: 英文释义（简明，适合六年级学生）
- segments: 词根词缀切分数组，把单词拆成 前缀/词根/后缀，每段 {part, type, meaningCn}；type 只能是 "prefix"|"root"|"suffix"|"word"；无法拆解的简单词就给单元素数组 type 为 "word"，meaningCn 为整体释义；所有 part 拼接起来必须严格等于 text（词组按空格拆成各单词即可）
- mnemonic: 词根词缀记忆法，中文，一两句话说明构词逻辑
- example1/example2: 两个英文例句（简单地道，适合六年级，必须包含该单词）
- example1Cn/example2Cn: 对应中文翻译

原始文本：
---
%s
---`;

export interface AIConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  prompt: string;
  thinking: boolean; // 是否开启思考模式（默认关闭）
  // 各项是否来自管理员覆盖（用于面板展示）
  overridden: { model: boolean; baseUrl: boolean; apiKey: boolean; prompt: boolean };
}

export async function getAIConfig(): Promise<AIConfig> {
  const [model, baseUrl, apiKey, prompt, thinking] = await Promise.all([
    getSetting("ai_model"),
    getSetting("ai_base_url"),
    getSetting("ai_api_key"),
    getSetting("ai_prompt"),
    getSetting("ai_thinking"),
  ]);
  return {
    model: model || process.env.DEEPSEEK_MODEL || DEFAULT_AI_MODEL,
    baseUrl: baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_AI_BASE_URL,
    apiKey: apiKey || process.env.DEEPSEEK_API_KEY || "",
    prompt: prompt || DEFAULT_AI_PROMPT,
    thinking: thinking === "true", // 默认关闭
    overridden: {
      model: !!model,
      baseUrl: !!baseUrl,
      apiKey: !!apiKey,
      prompt: !!prompt,
    },
  };
}

// ---- TTS 语音配置（Setting 表 > 环境变量 > 默认值）----
// 通用 OpenAI 兼容接口（POST {baseUrl}/v1/audio/speech），可接 OpenAI / 火山 / 阿里等兼容服务
export const DEFAULT_TTS_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_TTS_MODEL = "tts-1";
export const DEFAULT_TTS_VOICE = "alloy";

export interface TTSConfig {
  baseUrl: string;
  apiKey: string; // TTS_API_TOKEN（未启用鉴权可留空）
  model: string;
  voice: string;
  overridden: Record<string, boolean>;
}

export async function getTTSConfig(): Promise<TTSConfig> {
  const keys = ["tts_base_url", "tts_api_key", "tts_model", "tts_voice"];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  return {
    baseUrl: s.tts_base_url || process.env.TTS_BASE_URL || DEFAULT_TTS_BASE_URL,
    apiKey: s.tts_api_key || process.env.TTS_API_TOKEN || "",
    model: s.tts_model || process.env.TTS_MODEL || DEFAULT_TTS_MODEL,
    voice: s.tts_voice || process.env.TTS_VOICE || DEFAULT_TTS_VOICE,
    overridden: {
      baseUrl: !!s.tts_base_url,
      apiKey: !!s.tts_api_key,
      model: !!s.tts_model,
      voice: !!s.tts_voice,
    },
  };
}
