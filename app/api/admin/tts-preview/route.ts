import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getTTSConfig } from "@/lib/settings";
import { synthesizeSpeech } from "@/lib/openai-tts";

// 试听音色：按管理员面板当前（可未保存）的设置现场合成一小段样例，直接回传 WAV
// body: { baseUrl?, apiKey?, model?, voice?, instruction?, kind?: "word"|"sentence" }
const SAMPLE_WORD = "adventure";
const SAMPLE_SENTENCE = "Every great adventure begins with a single brave step.";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));

  const cfg = await getTTSConfig();
  const baseUrl = (typeof body.baseUrl === "string" && body.baseUrl.trim()) || cfg.baseUrl;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : cfg.apiKey;
  const model = (typeof body.model === "string" && body.model.trim()) || cfg.model;
  const voice = (typeof body.voice === "string" && body.voice.trim()) || cfg.voice;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : cfg.instruction;
  const text = body.kind === "sentence" ? SAMPLE_SENTENCE : SAMPLE_WORD;

  // 复用合成层（千问 DashScope 原生接口：POST 生成端点 → 取 URL → 下载 WAV）
  const buf = await synthesizeSpeech(
    { baseUrl, apiKey, model, voice, instruction, overridden: {} },
    text,
    { voice, instruction: instruction || undefined },
  );
  if (!buf) {
    return NextResponse.json({ error: "合成失败（请检查 Base URL / Token / 模型 / 音色）" }, { status: 502 });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
  });
}
