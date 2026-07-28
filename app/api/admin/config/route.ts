import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAIConfig, isRegistrationOpen, setSetting } from "@/lib/settings";

// 管理员站点配置：注册开关 + AI 解析配置（模型 / API Key / 提示词 / 思考模式）
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const ai = await getAIConfig();
  return NextResponse.json({
    registrationOpen: await isRegistrationOpen(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
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

  // AI 配置：字符串为空表示清除覆盖，回落到环境变量 / 默认值
  const aiFields: Record<string, string> = {
    aiModel: "ai_model",
    aiBaseUrl: "ai_base_url",
    aiApiKey: "ai_api_key",
    aiPrompt: "ai_prompt",
  };
  for (const [bodyKey, settingKey] of Object.entries(aiFields)) {
    if (typeof body[bodyKey] === "string") {
      await setSetting(settingKey, body[bodyKey].trim());
    }
  }
  if (typeof body.aiThinking === "boolean") {
    await setSetting("ai_thinking", body.aiThinking ? "true" : "false");
  }

  const ai = await getAIConfig();
  return NextResponse.json({
    ok: true,
    registrationOpen: await isRegistrationOpen(),
    ai: {
      model: ai.model,
      baseUrl: ai.baseUrl,
      apiKey: ai.apiKey,
      prompt: ai.prompt,
      thinking: ai.thinking,
      overridden: ai.overridden,
    },
  });
}
