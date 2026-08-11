import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/session";
import { getAIConfig, getTTSConfig, getSiteTitle, isRegistrationOpen, isStrictCheck, isAllowSkipReview, getLearnAppearance, getCheckAppearance, getDefaultDailyNewTarget, getDefaultDailyReviewTarget, setSetting, APPEARANCE_SETTING_KEYS, CHECK_APPEARANCE_SETTING_KEYS, type CheckAppearance, type LearnAppearance } from "@/lib/settings";
import { clampAppearanceValue, clampCheckAppearanceValue } from "@/lib/appearance";
import { findSiteIcon } from "@/lib/site";

async function configPayload() {
  const [ai, tts] = await Promise.all([getAIConfig(), getTTSConfig()]);
  return {
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    allowSkipReview: await isAllowSkipReview(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    learnAppearance: await getLearnAppearance(),
    checkAppearance: await getCheckAppearance(),
    defaultDailyNewTarget: await getDefaultDailyNewTarget(),
    defaultDailyReviewTarget: await getDefaultDailyReviewTarget(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
    tts: { ...tts },
  };
}

// 管理员站点配置：注册开关 + 站点信息 + 学习设置 + 外观 + AI 解析配置 + TTS 语音配置
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  return NextResponse.json(await configPayload());
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
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
    ttsModel: "tts_model",
    ttsVoice: "tts_voice",
    ttsInstruction: "tts_instruction",
  };
  for (const [bodyKey, settingKey] of Object.entries(strFields)) {
    if (typeof body[bodyKey] === "string") {
      await setSetting(settingKey, body[bodyKey].trim());
    }
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

  // 检查页外观
  if (body.checkAppearance && typeof body.checkAppearance === "object") {
    for (const [field, settingKey] of Object.entries(CHECK_APPEARANCE_SETTING_KEYS) as [keyof CheckAppearance, string][]) {
      const v = body.checkAppearance[field];
      if (typeof v === "number" && Number.isFinite(v)) {
        await setSetting(settingKey, String(clampCheckAppearanceValue(field, v)));
      }
    }
  }

  // 全局每日任务默认值
  if (Number.isInteger(body.defaultDailyNewTarget) && body.defaultDailyNewTarget >= 1 && body.defaultDailyNewTarget <= 200) {
    await setSetting("default_daily_new_target", String(body.defaultDailyNewTarget));
  }
  if (Number.isInteger(body.defaultDailyReviewTarget) && body.defaultDailyReviewTarget >= 1 && body.defaultDailyReviewTarget <= 500) {
    await setSetting("default_daily_review_target", String(body.defaultDailyReviewTarget));
  }

  return NextResponse.json({ ok: true, ...(await configPayload()) });
}
