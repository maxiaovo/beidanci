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
export const DEFAULT_TTS_PROVIDER = "mimo"; // mimo | qwen
export const DEFAULT_TTS_MODEL = "mimo-v2.5-tts";
export const DEFAULT_TTS_BASE_URL = "https://api.xiaomimimo.com/v1";
export const DEFAULT_TTS_VOICE = "Mia";
export const DEFAULT_TTS_FORMAT = "wav";
// 发音指令：放在 user 消息中控制合成风格（目标文本在 assistant 消息，见 MiMo TTS 文档）
export const DEFAULT_TTS_PROMPT =
  "Read the following English text clearly and naturally, at a moderate pace, for a language learner.";
// Qwen3-TTS 本地服务默认值
export const DEFAULT_QWEN_BASE_URL = "http://localhost:8765";
export const DEFAULT_QWEN_MODE = "clone"; // clone | custom | design
export const DEFAULT_QWEN_VOICE = "matthew-full";
export const DEFAULT_QWEN_LANGUAGE = "English";

export interface TTSConfig {
  provider: string; // mimo | qwen
  model: string;
  baseUrl: string;
  apiKey: string; // mimo: API Key；qwen: TTS_API_TOKEN（未启用鉴权可留空）
  voice: string;
  format: string;
  prompt: string;
  qwenMode: string;
  qwenVoice: string; // clone: 音色名；custom: 预设说话人
  qwenInstruct: string; // clone: 情绪注入（可空）；design: 音色描述（必填）
  qwenLanguage: string;
  qwenTemperature: string;
  qwenMaxTokens: string;
  overridden: Record<string, boolean>;
}

export async function getTTSConfig(): Promise<TTSConfig> {
  const keys = [
    "tts_provider",
    "tts_model",
    "tts_base_url",
    "tts_api_key",
    "tts_voice",
    "tts_format",
    "tts_prompt",
    "tts_qwen_mode",
    "tts_qwen_voice",
    "tts_qwen_instruct",
    "tts_qwen_language",
    "tts_qwen_temperature",
    "tts_qwen_max_tokens",
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value as string]));
  const provider = s.tts_provider || process.env.TTS_PROVIDER || DEFAULT_TTS_PROVIDER;
  return {
    provider,
    model: s.tts_model || process.env.MIMO_TTS_MODEL || DEFAULT_TTS_MODEL,
    baseUrl:
      s.tts_base_url ||
      (provider === "qwen"
        ? process.env.QWEN_BASE_URL || DEFAULT_QWEN_BASE_URL
        : process.env.MIMO_BASE_URL || DEFAULT_TTS_BASE_URL),
    apiKey: s.tts_api_key || process.env.MIMO_API_KEY || "",
    voice: s.tts_voice || process.env.MIMO_TTS_VOICE || DEFAULT_TTS_VOICE,
    format: s.tts_format || process.env.MIMO_TTS_FORMAT || DEFAULT_TTS_FORMAT,
    prompt: s.tts_prompt || process.env.MIMO_TTS_PROMPT || DEFAULT_TTS_PROMPT,
    qwenMode: s.tts_qwen_mode || process.env.QWEN_TTS_MODE || DEFAULT_QWEN_MODE,
    qwenVoice: s.tts_qwen_voice || process.env.QWEN_TTS_VOICE || DEFAULT_QWEN_VOICE,
    qwenInstruct: s.tts_qwen_instruct || process.env.QWEN_TTS_INSTRUCT || "",
    qwenLanguage: s.tts_qwen_language || process.env.QWEN_TTS_LANGUAGE || DEFAULT_QWEN_LANGUAGE,
    qwenTemperature: s.tts_qwen_temperature || process.env.QWEN_TTS_TEMPERATURE || "0",
    qwenMaxTokens: s.tts_qwen_max_tokens || process.env.QWEN_TTS_MAX_TOKENS || "2048",
    overridden: {
      provider: !!s.tts_provider,
      model: !!s.tts_model,
      baseUrl: !!s.tts_base_url,
      apiKey: !!s.tts_api_key,
      voice: !!s.tts_voice,
      format: !!s.tts_format,
      prompt: !!s.tts_prompt,
      qwenMode: !!s.tts_qwen_mode,
      qwenVoice: !!s.tts_qwen_voice,
      qwenInstruct: !!s.tts_qwen_instruct,
      qwenLanguage: !!s.tts_qwen_language,
      qwenTemperature: !!s.tts_qwen_temperature,
      qwenMaxTokens: !!s.tts_qwen_max_tokens,
    },
  };
}
