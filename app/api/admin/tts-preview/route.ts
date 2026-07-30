import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getTTSConfig } from "@/lib/settings";

// 试听音色：按管理员面板当前（可未保存）的设置现场合成一小段样例，直接回传 WAV
// body: { baseUrl?, apiKey?, mode?, voice, instruct?, language?, temperature?, kind?: "word"|"sentence" }
const SAMPLE_WORD = "adventure";
const SAMPLE_SENTENCE = "Every great adventure begins with a single brave step.";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const voice = typeof body.voice === "string" ? body.voice.trim() : "";
  if (!voice) return NextResponse.json({ error: "缺少 voice" }, { status: 400 });

  const cfg = await getTTSConfig();
  const baseUrl = (typeof body.baseUrl === "string" && body.baseUrl.trim()) || cfg.baseUrl;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : cfg.apiKey;
  const mode = typeof body.mode === "string" && body.mode.trim() ? body.mode.trim() : cfg.qwenMode;
  const language = typeof body.language === "string" && body.language.trim() ? body.language.trim() : cfg.qwenLanguage;
  const instruct = typeof body.instruct === "string" ? body.instruct : cfg.qwenInstruct;
  const temperature = Number(body.temperature ?? cfg.qwenTemperature) || 0;
  const text = body.kind === "sentence" ? SAMPLE_SENTENCE : SAMPLE_WORD;

  const payload: Record<string, unknown> = {
    mode,
    text,
    language,
    temperature,
    max_tokens: 2048,
    return_format: "wav",
  };
  if (mode === "clone") {
    payload.voice = voice;
    if (instruct) payload.instruct = instruct;
  } else if (mode === "custom") {
    payload.speaker = voice;
  } else {
    payload.instruct = instruct;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${baseUrl}/api/v1/tts`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 200);
      return NextResponse.json({ error: `合成失败（HTTP ${res.status}）：${errText}` }, { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      return NextResponse.json({ error: "合成返回的音频异常（过短）" }, { status: 502 });
    }
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: `无法连接 Qwen3-TTS 服务（${baseUrl}），请确认服务已启动` },
      { status: 502 },
    );
  }
}
