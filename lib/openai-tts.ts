// 千问（DashScope）TTS 原生接口：POST {baseUrl}（生成端点），
// body: { model, input: { text, voice, language_type }, instructions? }
// 响应 JSON 里 output.audio.url 是 24h 有效的音频地址，需再下载得到 WAV 二进制
// 适配千问 Qwen3-TTS；合成约实时级耗时，超时给足 300s
import type { TTSConfig } from "./settings";

export interface SynthesizeOpts {
  voice?: string;
  instruction?: string;
}

export async function synthesizeSpeech(
  cfg: TTSConfig,
  text: string,
  opts?: SynthesizeOpts,
): Promise<Buffer | null> {
  const url = cfg.baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const voice = opts?.voice || cfg.voice;
  const body: Record<string, unknown> = {
    model: cfg.model,
    input: {
      text,
      voice,
      language_type: "English", // 本应用只合成英语，显式指定语种提升发音质量
    },
  };
  // instruction 仅对 qwen3-tts-instruct-* 生效；qwen3-tts-flash 接受但不报错（被忽略）
  if (opts?.instruction) body.instructions = opts.instruction;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 400);
        console.error(`TTS HTTP ${res.status}: ${errText}`);
        // 5xx 瞬断重试；4xx（音色/参数错误）不重试
        if (res.status >= 500 && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        return null;
      }
      const json = (await res.json()) as {
        code?: string;
        message?: string;
        output?: { audio?: { url?: string } };
      };
      // DashScope 业务错误：HTTP 仍为 200 但响应体带 code/message
      if (json.code) {
        console.error(`TTS 业务错误 ${json.code}: ${json.message}`);
        return null;
      }
      const audioUrl = json.output?.audio?.url;
      if (!audioUrl) {
        console.error("TTS 响应缺少 output.audio.url:", JSON.stringify(json).slice(0, 300));
        return null;
      }
      // 下载音频二进制（24h 有效 URL）
      const wav = await downloadAudio(audioUrl);
      if (wav && wav.length >= 100) return wav;
      console.error("TTS 音频下载失败或过短", wav?.length);
      if (attempt < 3) {
        await sleep(attempt * 2000);
        continue;
      }
      return null;
    } catch (e) {
      console.error(`TTS 调用失败（第 ${attempt} 次）:`, e);
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }
  return null;
}

// 从 DashScope 返回的临时 URL 下载 WAV 二进制
async function downloadAudio(audioUrl: string): Promise<Buffer | null> {
  try {
    const r = await fetch(audioUrl, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) {
      console.error(`TTS 音频下载 HTTP ${r.status}`);
      return null;
    }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("TTS 音频下载异常:", e);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
