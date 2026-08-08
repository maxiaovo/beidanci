// 音频版本管理：每次合成（导入/重新生成）追加一条 WordAudio，
// Word.audioWord/audioEx1/audioEx2 始终指向当前启用版本的文件名（读取路径不变）
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { AUDIO_DIR } from "./tts";

export type AudioKind = "word" | "ex1" | "ex2";

export const AUDIO_KINDS: AudioKind[] = ["word", "ex1", "ex2"];

const FIELD = { word: "audioWord", ex1: "audioEx1", ex2: "audioEx2" } as const;

export async function listAudioVersions(wordId: string, kind: AudioKind) {
  return prisma.wordAudio.findMany({
    where: { wordId, kind },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function activeAudioFile(wordId: string, kind: AudioKind) {
  const w = await prisma.word.findUnique({
    where: { id: wordId },
    select: { audioWord: true, audioEx1: true, audioEx2: true },
  });
  return w?.[FIELD[kind]] ?? null;
}

// 登记新版本并设为当前启用（新生成即生效，旧版本保留可回切）
export async function registerAudioVersion(wordId: string, kind: AudioKind, file: string, voice = "") {
  const v = await prisma.wordAudio.create({ data: { wordId, kind, file, voice } });
  await prisma.word.update({ where: { id: wordId }, data: { [FIELD[kind]]: file } });
  return v;
}

// 切换当前启用版本，返回该版本（不存在返回 null）
export async function activateAudioVersion(versionId: string) {
  const v = await prisma.wordAudio.findUnique({ where: { id: versionId } });
  if (!v) return null;
  await prisma.word.update({ where: { id: v.wordId }, data: { [FIELD[v.kind as AudioKind]]: v.file } });
  return v;
}

// 删除版本（含音频文件）；若删的是当前版本，自动切换到剩余最新版本，无剩余则置 null
export async function deleteAudioVersion(versionId: string): Promise<{ active: string | null } | null> {
  const v = await prisma.wordAudio.findUnique({ where: { id: versionId } });
  if (!v) return null;
  const kind = v.kind as AudioKind;
  await prisma.wordAudio.delete({ where: { id: v.id } });
  try {
    fs.unlinkSync(path.join(AUDIO_DIR, v.file));
  } catch {
    // 文件可能已不存在，忽略
  }
  let active = await activeAudioFile(v.wordId, kind);
  if (active === v.file) {
    const rest = await prisma.wordAudio.findFirst({
      where: { wordId: v.wordId, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    active = rest?.file ?? null;
    await prisma.word.update({ where: { id: v.wordId }, data: { [FIELD[kind]]: active } });
  }
  return { active };
}
