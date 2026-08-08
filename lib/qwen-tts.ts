// 千问（DashScope）TTS 原生接口：POST {baseUrl}（生成端点），
// body: { model, input: { text, voice, language_type, instructions? } }
// 响应 JSON 里 output.audio.url 是 24h 有效的音频地址，需再下载得到 WAV 二进制
// 适配千问 Qwen3-TTS；合成约实时级耗时，超时给足 300s
import type { TTSConfig } from "./settings";

export interface SynthesizeOpts {
  voice?: string;
  instruction?: string;
  out?: { error?: string }; // 失败时回传原因，供管理端展示
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
  const input: Record<string, unknown> = {
    text,
    voice,
    language_type: "English", // 本应用只合成英语，显式指定语种提升发音质量
  };
  // instruction 仅对 qwen3-tts-instruct-* 生效；qwen3-tts-flash 接受但不报错（被忽略）。
  // 按千问官方 HTTP 规范（platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts），
  // instructions 须嵌套在 input 下，而非顶层。
  if (opts?.instruction) input.instructions = opts.instruction;
  const body: Record<string, unknown> = {
    model: cfg.model,
    input,
  };

  let reason = "未知原因";
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
        reason = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
        console.error(`TTS ${reason}`);
        // 5xx 瞬断与 429 限流重试；其余 4xx（音色/参数错误）不重试
        if ((res.status >= 500 || res.status === 429) && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        break;
      }
      const json = (await res.json()) as {
        code?: string;
        message?: string;
        output?: { audio?: { url?: string } };
      };
      // DashScope 业务错误：HTTP 仍为 200 但响应体带 code/message
      if (json.code) {
        reason = `${json.code}: ${json.message ?? ""}`;
        console.error(`TTS 业务错误 ${reason}`);
        // 限流类业务错误重试，其余（参数/音色错误）不重试
        if (/throttl/i.test(json.code) && attempt < 3) {
          await sleep(attempt * 2000);
          continue;
        }
        break;
      }
      const audioUrl = json.output?.audio?.url;
      if (!audioUrl) {
        reason = "响应缺少 output.audio.url";
        console.error(`TTS ${reason}:`, JSON.stringify(json).slice(0, 300));
        break;
      }
      // 下载音频二进制（24h 有效 URL）
      const wav = await downloadAudio(audioUrl);
      if (wav && wav.length >= 100) return wav;
      reason = `音频下载失败或过短（${wav?.length ?? 0} 字节）`;
      console.error(`TTS ${reason}`);
      if (attempt < 3) {
        await sleep(attempt * 2000);
        continue;
      }
      break;
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      console.error(`TTS 调用失败（第 ${attempt} 次）:`, e);
      if (attempt < 3) await sleep(attempt * 2000);
    }
  }
  if (opts?.out) opts.out.error = reason;
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
