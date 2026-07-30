// Qwen3-TTS 本地服务（MLX）：POST /api/v1/tts，return_format=wav 时响应体直接是 WAV 二进制
// 接口说明见 API_FOR_KIMI.md；合成约实时级耗时，超时给足 300s
import type { TTSConfig } from "./settings";

// 从音色池随机抽取一个音色；池为空时回落到固定配置的 qwenVoice
export function pickQwenVoice(cfg: TTSConfig): string {
  if (cfg.qwenVoices.length > 0) {
    return cfg.qwenVoices[Math.floor(Math.random() * cfg.qwenVoices.length)];
  }
  return cfg.qwenVoice;
}

export async function synthesizeQwen(cfg: TTSConfig, text: string, voiceOverride?: string): Promise<Buffer | null> {
  const url = `${cfg.baseUrl}/api/v1/tts`;
  const picked = voiceOverride ?? pickQwenVoice(cfg);
  const body: Record<string, unknown> = {
    mode: cfg.qwenMode,
    text,
    language: cfg.qwenLanguage,
    temperature: Number(cfg.qwenTemperature) || 0,
    max_tokens: Number(cfg.qwenMaxTokens) || 2048,
    return_format: "wav",
  };
  if (cfg.qwenMode === "clone") {
    body.voice = picked;
    if (cfg.qwenInstruct) body.instruct = cfg.qwenInstruct; // clone 模式 instruct = 情绪注入
  } else if (cfg.qwenMode === "custom") {
    body.speaker = picked;
  } else {
    body.instruct = cfg.qwenInstruct; // design 模式 instruct = 音色描述（必填）
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  // 瞬断重试：网络错误 / 5xx 重试（隧道抖动可恢复）；4xx（如音色不存在）不重试
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        console.error(`Qwen TTS HTTP ${res.status}: ${errText}`);
        if (res.status >= 500 && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) {
        console.error("Qwen TTS 返回音频过短，疑似异常", buf.length);
        if (attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      return buf;
    } catch (e) {
      console.error(`Qwen TTS 调用失败（第 ${attempt} 次）:`, e);
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
