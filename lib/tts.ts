// TTS 合成层：统一走 OpenAI 兼容 TTS 接口（见 lib/openai-tts.ts）
// 合成结果统一写入 data/audio/，返回文件名
// opts.out.voice 回传本次实际使用的音色名
import fs from "fs";
import path from "path";
import { getTTSConfig } from "./settings";
import { synthesizeSpeech } from "./openai-tts";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

export async function synthesize(
  text: string,
  fileName: string,
  opts?: { out?: { voice?: string } },
): Promise<string | null> {
  if (!text.trim()) return null;
  const cfg = await getTTSConfig();
  if (opts?.out) opts.out.voice = cfg.voice;
  const buf = await synthesizeSpeech(cfg, text);
  if (!buf) return null;
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);
  return fileName;
}
