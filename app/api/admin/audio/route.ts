import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AUDIO_DIR, synthesize } from "@/lib/tts";

// 管理员音频资源检查：列出全部单词的音频（含文件是否存在于 data/audio/）
function fileExists(name: string | null | undefined) {
  return !!name && fs.existsSync(path.join(AUDIO_DIR, name));
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const words = await prisma.word.findMany({
    orderBy: [
      { unit: { book: { createdAt: "asc" } } },
      { unit: { orderIndex: "asc" } },
      { orderIndex: "asc" },
    ],
    select: {
      id: true,
      text: true,
      phonetic: true,
      audioWord: true,
      audioEx1: true,
      audioEx2: true,
      unit: { select: { title: true, book: { select: { name: true } } } },
    },
  });
  return NextResponse.json({
    words: words.map((w) => ({
      id: w.id,
      text: w.text,
      phonetic: w.phonetic,
      book: w.unit.book.name,
      unit: w.unit.title,
      audioWord: w.audioWord,
      audioEx1: w.audioEx1,
      audioEx2: w.audioEx2,
      fileWord: fileExists(w.audioWord),
      fileEx1: fileExists(w.audioEx1),
      fileEx2: fileExists(w.audioEx2),
    })),
  });
}

// 重新生成某个单词的音频（kind: word | ex1 | ex2 | all，默认 all）
// 生成成功的才覆盖数据库记录；失败的保留原值
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const wordId = typeof body.wordId === "string" ? body.wordId : "";
  const kind = ["word", "ex1", "ex2", "all"].includes(body.kind) ? body.kind : "all";
  if (!wordId) return NextResponse.json({ error: "缺少 wordId" }, { status: 400 });

  const w = await prisma.word.findUnique({ where: { id: wordId } });
  if (!w) return NextResponse.json({ error: "单词不存在" }, { status: 404 });

  const data: { audioWord?: string; audioEx1?: string; audioEx2?: string } = {};
  const failed: string[] = [];
  if (kind === "word" || kind === "all") {
    const a = await synthesize(w.text, `${w.id}_word.wav`);
    if (a) data.audioWord = a;
    else failed.push("word");
  }
  if (kind === "ex1" || kind === "all") {
    const a = await synthesize(w.example1, `${w.id}_ex1.wav`);
    if (a) data.audioEx1 = a;
    else failed.push("ex1");
  }
  if (kind === "ex2" || kind === "all") {
    const a = await synthesize(w.example2, `${w.id}_ex2.wav`);
    if (a) data.audioEx2 = a;
    else failed.push("ex2");
  }
  if (Object.keys(data).length > 0) {
    await prisma.word.update({ where: { id: w.id }, data });
  }
  const updated = await prisma.word.findUnique({
    where: { id: w.id },
    select: { audioWord: true, audioEx1: true, audioEx2: true },
  });
  return NextResponse.json({
    ok: failed.length === 0,
    failed,
    ...updated,
    fileWord: fileExists(updated?.audioWord),
    fileEx1: fileExists(updated?.audioEx1),
    fileEx2: fileExists(updated?.audioEx2),
  });
}
