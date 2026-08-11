import { NextResponse } from "next/server";
import { AuthError, requireAdmin } from "@/lib/session";
import { getTTSConfig } from "@/lib/settings";

// 探测千问（DashScope）TTS 服务是否可用：用兼容模式 /models 验证 Token 连通性与鉴权
// body: { apiKey? } —— 未填则用已保存配置，方便保存前先测
// 服务不可达也返回 200 + { ok: false }，由前端按 ok 字段展示状态
const DASHSCOPE_COMPAT_MODELS = "https://dashscope.aliyuncs.com/compatible-mode/v1/models";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const cfg = await getTTSConfig();
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : cfg.apiKey;

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetch(DASHSCOPE_COMPAT_MODELS, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `服务返回 HTTP ${res.status}（请检查 Token）` });
    }
    return NextResponse.json({ ok: true, baseUrl: cfg.baseUrl });
  } catch {
    return NextResponse.json({ ok: false, error: "无法连接千问 TTS 服务，请确认 Token 正确且可访问" });
  }
}
