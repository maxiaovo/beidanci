// MiMo V2.5 TTS：非流式调用，返回 wav 并保存到 data/audio/
// 模型/Key/音色优先取管理员在 Setting 表中的配置，回落到环境变量 / 默认值
import fs from "fs";
import path from "path";
import { getTTSConfig } from "./settings";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

function ensureDir() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export async function synthesize(text: string, fileName: string): Promise<string | null> {
  if (!text.trim()) return null;
  ensureDir();
  const cfg = await getTTSConfig();
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages: [
      { role: "user", content: "Read the following English text clearly and naturally, at a moderate pace, for a language learner." },
      { role: "assistant", content: text },
    ],
    audio: { format: "wav", voice: cfg.voice },
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
    fs.writeFileSync(path.join(AUDIO_DIR, fileName), Buffer.from(b64, "base64"));
    return fileName;
  } catch (e) {
    console.error("TTS 调用失败:", e);
    return null;
  }
}
