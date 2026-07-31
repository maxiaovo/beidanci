// OpenAI 兼容 TTS 接口：POST {baseUrl}/v1/audio/speech，response_format=wav 时响应体直接是 WAV 二进制
// 适配 OpenAI、火山引擎、阿里百炼等兼容该接口的 TTS 服务；合成约实时级耗时，超时给足 300s
import type { TTSConfig } from "./settings";

export async function synthesizeSpeech(cfg: TTSConfig, text: string): Promise<Buffer | null> {
  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/audio/speech`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  // 瞬断重试：网络错误 / 5xx 重试；4xx（如音色不存在）不重试
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          voice: cfg.voice,
          input: text,
          response_format: "wav",
        }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        console.error(`TTS HTTP ${res.status}: ${errText}`);
        if (res.status >= 500 && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) {
        console.error("TTS 返回音频过短，疑似异常", buf.length);
        if (attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      return buf;
    } catch (e) {
      console.error(`TTS 调用失败（第 ${attempt} 次）:`, e);
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
