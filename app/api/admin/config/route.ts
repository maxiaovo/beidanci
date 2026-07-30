import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAIConfig, getTTSConfig, getSiteTitle, isRegistrationOpen, isStrictCheck, isAllowSkipReview, getLearnAppearance, setSetting, APPEARANCE_SETTING_KEYS, type LearnAppearance } from "@/lib/settings";
import { clampAppearanceValue } from "@/lib/appearance";
import { findSiteIcon } from "@/lib/site";

// 管理员站点配置：注册开关 + 站点信息 + 强检查 + AI 解析配置 + TTS 语音配置
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const [ai, tts] = await Promise.all([getAIConfig(), getTTSConfig()]);
  return NextResponse.json({
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    allowSkipReview: await isAllowSkipReview(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    learnAppearance: await getLearnAppearance(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
    tts: { ...tts },
  });
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));

  if (typeof body.registrationOpen === "boolean") {
    await setSetting("registration_open", body.registrationOpen ? "true" : "false");
  }
  if (typeof body.strictCheck === "boolean") {
    await setSetting("strict_check", body.strictCheck ? "true" : "false");
  }
  if (typeof body.allowSkipReview === "boolean") {
    await setSetting("allow_skip_review", body.allowSkipReview ? "true" : "false");
  }
  if (typeof body.siteTitle === "string") {
    await setSetting("site_title", body.siteTitle.trim());
  }

  // AI / TTS 配置：字符串为空表示清除覆盖，回落到环境变量 / 默认值
  const strFields: Record<string, string> = {
    aiModel: "ai_model",
    aiBaseUrl: "ai_base_url",
    aiApiKey: "ai_api_key",
    aiPrompt: "ai_prompt",
    ttsBaseUrl: "tts_base_url",
    ttsApiKey: "tts_api_key",
    ttsQwenMode: "tts_qwen_mode",
    ttsQwenVoice: "tts_qwen_voice",
    ttsQwenInstruct: "tts_qwen_instruct",
    ttsQwenLanguage: "tts_qwen_language",
    ttsQwenTemperature: "tts_qwen_temperature",
    ttsQwenMaxTokens: "tts_qwen_max_tokens",
  };
  for (const [bodyKey, settingKey] of Object.entries(strFields)) {
    if (typeof body[bodyKey] === "string") {
      await setSetting(settingKey, body[bodyKey].trim());
    }
  }
  // qwen 音色池：字符串数组，存为 JSON；导入音频时从中随机抽取音色
  if (Array.isArray(body.ttsQwenVoices)) {
    const pool = body.ttsQwenVoices.filter((v: unknown) => typeof v === "string" && (v as string).trim());
    await setSetting("tts_qwen_voices", JSON.stringify(pool));
  }
  if (typeof body.aiThinking === "boolean") {
    await setSetting("ai_thinking", body.aiThinking ? "true" : "false");
  }

  // 学习页外观：数值字段取整并夹取到合法范围后存 Setting 表
  if (body.learnAppearance && typeof body.learnAppearance === "object") {
    for (const [field, settingKey] of Object.entries(APPEARANCE_SETTING_KEYS) as [keyof LearnAppearance, string][]) {
      const v = body.learnAppearance[field];
      if (typeof v === "number" && Number.isFinite(v)) {
        await setSetting(settingKey, String(clampAppearanceValue(field, v)));
      }
    }
  }

  const [ai, tts] = await Promise.all([getAIConfig(), getTTSConfig()]);
  return NextResponse.json({
    ok: true,
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    allowSkipReview: await isAllowSkipReview(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    learnAppearance: await getLearnAppearance(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
    tts: { ...tts },
  });
}
