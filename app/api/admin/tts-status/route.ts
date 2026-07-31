import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getTTSConfig } from "@/lib/settings";

// 探测 OpenAI 兼容 TTS 服务是否可用（GET {baseUrl}/models 验证连通性与鉴权）
// body: { baseUrl?, apiKey? } —— 未填则用已保存的配置，方便保存前先测
// 服务不可达也返回 200 + { ok: false }，由前端按 ok 字段展示状态
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
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `服务返回 HTTP ${res.status}（请检查 Base URL / Token）` });
    }
    return NextResponse.json({ ok: true, baseUrl });
  } catch {
    return NextResponse.json({ ok: false, error: `无法连接 ${baseUrl}，请确认 TTS 服务地址正确且可访问` });
  }
}
