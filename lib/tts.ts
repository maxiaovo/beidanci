// TTS 合成层：统一走本地 Qwen3-TTS 服务（生产经 SSH 反向隧道访问，见 README）
// 合成结果统一写入 data/audio/，返回文件名
// 支持音色池：opts.out.voice 回传本次实际使用的音色名
import fs from "fs";
import path from "path";
import { getTTSConfig } from "./settings";
import { pickQwenVoice, synthesizeQwen } from "./qwen-tts";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

export async function synthesize(
  text: string,
  fileName: string,
  opts?: { phonetic?: string; out?: { voice?: string } },
): Promise<string | null> {
  if (!text.trim()) return null;
  const cfg = await getTTSConfig();
  const voice = pickQwenVoice(cfg);
  if (opts?.out) opts.out.voice = voice;
  const buf = await synthesizeQwen(cfg, text, voice);
  if (!buf) return null;
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);
  return fileName;
}
