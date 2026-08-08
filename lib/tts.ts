// TTS 合成层：统一走千问（DashScope）TTS 原生接口（见 lib/openai-tts.ts）
// 合成结果统一写入 data/audio/，返回文件名
// opts.out.voice 回传本次实际使用的音色名（随机或指定）；opts.out.error 回传失败原因
import fs from "fs";
import path from "path";
import { getTTSConfig, EN_TTS_VOICES, DEFAULT_TTS_INSTRUCTION } from "./settings";
import { synthesizeSpeech } from "./openai-tts";

export const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

export interface SynthesizeOpts {
  out?: { voice?: string; error?: string }; // 回传本次实际音色；失败时回传原因
  voice?: string; // 指定音色（试听 / 重新生成时用），不传则随机选 EN_TTS_VOICES
  instruction?: string; // 临时指令（覆盖默认），用于重新生成时调整朗读语气
  altText?: string; // 替代拼写，仅影响读音，不改数据库里的单词文本
}

export async function synthesize(
  text: string,
  fileName: string,
  opts?: SynthesizeOpts,
): Promise<string | null> {
  if (!text.trim()) return null;
  const cfg = await getTTSConfig();

  // 随机选用英语音色池中的其一（管理员后台的试听 / 指定除外）
  const voice =
    opts?.voice || EN_TTS_VOICES[Math.floor(Math.random() * EN_TTS_VOICES.length)];
  // 指令：临时覆盖 > 管理员设置 > 默认值
  const instruction = opts?.instruction || cfg.instruction || DEFAULT_TTS_INSTRUCTION;
  // 替代拼写：提供时用它参与合成，不改单词文本
  const synthText = opts?.altText?.trim() || text;

  if (opts?.out) opts.out.voice = voice;

  const buf = await synthesizeSpeech(cfg, synthText, { voice, instruction, out: opts?.out });
  if (!buf) return null;
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), buf);
  return fileName;
}
