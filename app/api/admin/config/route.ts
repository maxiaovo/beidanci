import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAIConfig, getTTSConfig, getSiteTitle, isRegistrationOpen, isStrictCheck, setSetting } from "@/lib/settings";
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
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
    tts: {
      model: tts.model,
      baseUrl: tts.baseUrl,
      apiKey: tts.apiKey,
      voice: tts.voice,
      overridden: tts.overridden,
    },
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
  if (typeof body.siteTitle === "string") {
    await setSetting("site_title", body.siteTitle.trim());
  }

  // AI / TTS 配置：字符串为空表示清除覆盖，回落到环境变量 / 默认值
  const strFields: Record<string, string> = {
    aiModel: "ai_model",
    aiBaseUrl: "ai_base_url",
    aiApiKey: "ai_api_key",
    aiPrompt: "ai_prompt",
    ttsModel: "tts_model",
    ttsBaseUrl: "tts_base_url",
    ttsApiKey: "tts_api_key",
    ttsVoice: "tts_voice",
  };
  for (const [bodyKey, settingKey] of Object.entries(strFields)) {
    if (typeof body[bodyKey] === "string") {
      await setSetting(settingKey, body[bodyKey].trim());
    }
  }
  if (typeof body.aiThinking === "boolean") {
    await setSetting("ai_thinking", body.aiThinking ? "true" : "false");
  }

  const [ai, tts] = await Promise.all([getAIConfig(), getTTSConfig()]);
  return NextResponse.json({
    ok: true,
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
    tts: {
      model: tts.model,
      baseUrl: tts.baseUrl,
      apiKey: tts.apiKey,
      voice: tts.voice,
      overridden: tts.overridden,
    },
  });
}
