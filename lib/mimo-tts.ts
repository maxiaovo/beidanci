// MiMo V2.5 TTS：非流式调用，返回 wav 字节（由 lib/tts.ts 统一落盘）
import type { TTSConfig } from "./settings";

export async function synthesizeMimo(
  cfg: TTSConfig,
  text: string,
  opts?: { phonetic?: string },
): Promise<Buffer | null> {
  const url = `${cfg.baseUrl}/chat/completions`;
  // 有音标时附在发音指令里，让模型按 IPA 发音，避免专有名词/多音词读错
  const instruction = opts?.phonetic
    ? `${cfg.prompt}\nThe correct pronunciation is ${opts.phonetic} — pronounce it exactly according to this IPA transcription.`
    : cfg.prompt;
  const body = {
    model: cfg.model,
    messages: [
      { role: "user", content: instruction },
      { role: "assistant", content: text },
    ],
    audio: { format: cfg.format, voice: cfg.voice },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`TTS HTTP ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const b64: string | undefined = data.choices?.[0]?.message?.audio?.data;
    if (!b64) {
      console.error("TTS 返回无音频数据", JSON.stringify(data).slice(0, 300));
      return null;
    }
    return Buffer.from(b64, "base64");
  } catch (e) {
    console.error("TTS 调用失败:", e);
    return null;
  }
}
