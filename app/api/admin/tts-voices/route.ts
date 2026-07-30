import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getTTSConfig } from "@/lib/settings";

// 从 Qwen3-TTS 服务动态拉取可用音色（不硬编码音色名）
// body: { baseUrl?, apiKey? } —— 未填则用已保存的配置，方便在保存前先试听
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

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const [voicesRes, speakersRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/voices`, { headers, signal: AbortSignal.timeout(15_000) }),
      fetch(`${baseUrl}/api/v1/speakers`, { headers, signal: AbortSignal.timeout(15_000) }),
    ]);
    if (!voicesRes.ok || !speakersRes.ok) {
      return NextResponse.json(
        { error: `Qwen3-TTS 服务返回错误（voices ${voicesRes.status} / speakers ${speakersRes.status}）` },
        { status: 502 },
      );
    }
    const voicesJson = await voicesRes.json();
    const speakersJson = await speakersRes.json();
    // 同一说话人可能按语言返回多条（如 Vivian English/Chinese），按名字去重
    const dedupe = (arr: unknown[]) => [...new Set(arr.filter((v): v is string => typeof v === "string" && !!v))];
    const voices = dedupe((voicesJson.voices ?? []).map((v: { name?: string }) => v.name));
    const speakers = dedupe((speakersJson.speakers ?? []).map((v: { name?: string }) => v.name));
    return NextResponse.json({ ok: true, voices, speakers });
  } catch {
    return NextResponse.json(
      { error: `无法连接 Qwen3-TTS 服务（${baseUrl}），请确认服务已启动` },
      { status: 502 },
    );
  }
}
