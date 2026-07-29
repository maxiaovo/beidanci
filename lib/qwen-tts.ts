// Qwen3-TTS 本地服务（MLX）：POST /api/v1/tts，return_format=wav 时响应体直接是 WAV 二进制
// 接口说明见 API_FOR_KIMI.md；合成约实时级耗时，超时给足 300s
import type { TTSConfig } from "./settings";

export async function synthesizeQwen(cfg: TTSConfig, text: string): Promise<Buffer | null> {
  const url = `${cfg.baseUrl}/api/v1/tts`;
  const body: Record<string, unknown> = {
    mode: cfg.qwenMode,
    text,
    language: cfg.qwenLanguage,
    temperature: Number(cfg.qwenTemperature) || 0,
    max_tokens: Number(cfg.qwenMaxTokens) || 2048,
    return_format: "wav",
  };
  if (cfg.qwenMode === "clone") {
    body.voice = cfg.qwenVoice;
    if (cfg.qwenInstruct) body.instruct = cfg.qwenInstruct; // clone 模式 instruct = 情绪注入
  } else if (cfg.qwenMode === "custom") {
    body.speaker = cfg.qwenVoice;
  } else {
    body.instruct = cfg.qwenInstruct; // design 模式 instruct = 音色描述（必填）
  }
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      console.error(`Qwen TTS HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      console.error("Qwen TTS 返回音频过短，疑似异常", buf.length);
      return null;
    }
    return buf;
  } catch (e) {
    console.error("Qwen TTS 调用失败:", e);
    return null;
  }
}
