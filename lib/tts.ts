// TTS 调度层：根据管理员配置的 provider（mimo | qwen）选择合成引擎
// 合成结果统一写入 data/audio/，返回文件名
// qwen 引擎支持音色池：opts.out.voice 回传本次实际使用的音色名
import fs from "fs";
import path from "path";
import { getTTSConfig } from "./settings";
import { synthesizeMimo } from "./mimo-tts";
import { pickQwenVoice, synthesizeQwen } from "./qwen-tts";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

export async function synthesize(
  text: string,
  fileName: string,
  opts?: { phonetic?: string; out?: { voice?: string } },
): Promise<string | null> {
  if (!text.trim()) return null;
  const cfg = await getTTSConfig();
  let buf: Buffer | null;
  if (cfg.provider === "qwen") {
    const voice = pickQwenVoice(cfg);
    if (opts?.out) opts.out.voice = voice;
    buf = await synthesizeQwen(cfg, text, voice);
  } else {
    buf = await synthesizeMimo(cfg, text, opts);
  }
  if (!buf) return null;
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);
  return fileName;
}
