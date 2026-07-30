// 站点级设置（存 Setting 表）
import { prisma } from "./db";

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
// 只接本地 Qwen3-TTS 服务；生产服务器经 SSH 反向隧道以 127.0.0.1:8765 访问（见 README）
export const DEFAULT_QWEN_BASE_URL = "http://localhost:8765";
export const DEFAULT_QWEN_MODE = "clone"; // clone | custom | design
export const DEFAULT_QWEN_VOICE = "matthew-full";
export const DEFAULT_QWEN_LANGUAGE = "English";

export interface TTSConfig {
  baseUrl: string;
  apiKey: string; // TTS_API_TOKEN（未启用鉴权可留空）
  qwenMode: string;
  qwenVoice: string; // clone: 音色名；custom: 预设说话人
  qwenVoices: string[]; // 音色池：非空时每次合成随机抽取一个（避免单调），空则固定用 qwenVoice
  qwenInstruct: string; // clone: 情绪注入（可空）；design: 音色描述（必填）
  qwenLanguage: string;
  qwenTemperature: string;
  qwenMaxTokens: string;
  overridden: Record<string, boolean>;
}

// 音色池存为 JSON 数组字符串；解析失败或为空时返回 []
function parseVoicePool(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim());
  } catch {
    return [];
  }
}

export async function getTTSConfig(): Promise<TTSConfig> {
  const keys = [
    "tts_base_url",
    "tts_api_key",
    "tts_qwen_mode",
    "tts_qwen_voice",
    "tts_qwen_voices",
    "tts_qwen_instruct",
    "tts_qwen_language",
    "tts_qwen_temperature",
    "tts_qwen_max_tokens",
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  return {
    baseUrl: s.tts_base_url || process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL,
    apiKey: s.tts_api_key || process.env.TTS_API_TOKEN || "",
    qwenMode: s.tts_qwen_mode || process.env.QWEN_TTS_MODE || DEFAULT_QWEN_MODE,
    qwenVoice: s.tts_qwen_voice || process.env.QWEN_TTS_VOICE || DEFAULT_QWEN_VOICE,
    qwenVoices: parseVoicePool(s.tts_qwen_voices),
    qwenInstruct: s.tts_qwen_instruct || process.env.QWEN_TTS_INSTRUCT || "",
    qwenLanguage: s.tts_qwen_language || process.env.QWEN_TTS_LANGUAGE || DEFAULT_QWEN_LANGUAGE,
    qwenTemperature: s.tts_qwen_temperature || process.env.QWEN_TTS_TEMPERATURE || "0",
    qwenMaxTokens: s.tts_qwen_max_tokens || process.env.QWEN_TTS_MAX_TOKENS || "2048",
    overridden: {
      baseUrl: !!s.tts_base_url,
      apiKey: !!s.tts_api_key,
      qwenMode: !!s.tts_qwen_mode,
      qwenVoice: !!s.tts_qwen_voice,
      qwenVoices: !!s.tts_qwen_voices,
      qwenInstruct: !!s.tts_qwen_instruct,
      qwenLanguage: !!s.tts_qwen_language,
      qwenTemperature: !!s.tts_qwen_temperature,
      qwenMaxTokens: !!s.tts_qwen_max_tokens,
    },
  };
}
