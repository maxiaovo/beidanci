import { NextResponse } from "next/server";
import {
  getAiPrompt,
  getAiPromptEntries,
  isAiPromptKey,
  saveAiPrompt,
} from "@/lib/ai-prompts";
import { getAiResourceStats } from "@/lib/ai-resources";
import { requestDeepSeekTextWithMeta, type DeepSeekMessage } from "@/lib/deepseek-client";
import { AuthError, requireAdmin } from "@/lib/session";

async function adminOnly() {
  try {
    await requireAdmin();
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function GET() {
  const denied = await adminOnly();
  if (denied) return denied;
  const [prompts, stats] = await Promise.all([getAiPromptEntries(), getAiResourceStats()]);
  return NextResponse.json({ prompts, stats });
}

export async function PATCH(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!isAiPromptKey(body.key)) return NextResponse.json({ error: "未知提示词功能" }, { status: 400 });
  if (typeof body.prompt !== "string" || body.prompt.length > 30_000) {
    return NextResponse.json({ error: "提示词必须是 30000 字符以内的文本" }, { status: 400 });
  }
  await saveAiPrompt(body.key, body.prompt);
  const prompt = (await getAiPromptEntries()).find((item) => item.key === body.key);
  return NextResponse.json({ ok: true, prompt });
}

export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!isAiPromptKey(body.key)) return NextResponse.json({ error: "未知提示词功能" }, { status: 400 });
  if (typeof body.input !== "string" || !body.input.trim() || body.input.length > 12_000) {
    return NextResponse.json({ error: "调试输入需为 1–12000 字符" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : await getAiPrompt(body.key);
  if (!prompt || prompt.length > 30_000) return NextResponse.json({ error: "提示词为空或过长" }, { status: 400 });

  const messages: DeepSeekMessage[] = body.key === "vocabulary.unit_analysis"
    ? [{ role: "user", content: prompt.replace("%s", body.input.trim()) }]
    : [{ role: "system", content: prompt }, { role: "user", content: body.input.trim() }];
  try {
    const result = await requestDeepSeekTextWithMeta(body.key, messages, 0.2, 2);
    return NextResponse.json({
      output: result.content,
      cached: result.cached,
      cacheKey: result.cacheKey,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 调试失败" }, { status: 502 });
  }
}
