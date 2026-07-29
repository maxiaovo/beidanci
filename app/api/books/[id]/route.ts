import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { requestStop } from "@/lib/import-runner";
import { AUDIO_DIR } from "@/lib/tts";

// 单词列表浏览：书 → 单元 → 单词
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: user.role === "admin" ? { id } : { id, ...bookVisibleWhere(user.id) },
  });
  if (!book) {
    return NextResponse.json({ error: "单词书不存在" }, { status: 404 });
  }

  const units = await prisma.unit.findMany({
    where: { bookId: id },
    orderBy: { orderIndex: "asc" },
    include: { words: { orderBy: { orderIndex: "asc" } } },
  });

  const progresses = await prisma.wordProgress.findMany({
    where: { userId: user.id, word: { unit: { bookId: id } } },
    select: { wordId: true, stage: true, nextReviewAt: true },
  });
  const progressMap = new Map(progresses.map((p) => [p.wordId, p]));

  return NextResponse.json({
    book: { id: book.id, name: book.name, status: book.status },
    units: units.map((u) => ({
      id: u.id,
      title: u.title,
      words: u.words.map((w) => {
        const p = progressMap.get(w.id);
        return {
          id: w.id,
          text: w.text,
          phonetic: w.phonetic,
          pos: w.pos,
          meaningCn: w.meaningCn,
          meaningEn: w.meaningEn,
          mnemonic: w.mnemonic,
          segments: JSON.parse(w.segments || "[]"),
          example1: w.example1,
          example1Cn: w.example1Cn,
          example2: w.example2,
          example2Cn: w.example2Cn,
          audioWord: w.audioWord,
          audioEx1: w.audioEx1,
          audioEx2: w.audioEx2,
          stage: p?.stage ?? null,
          nextReviewAt: p?.nextReviewAt ?? null,
        };
      }),
    })),
  });
}

// 删除单词书：先停止导入，再删除音频文件与数据库记录（单元/单词/进度/日志级联删除）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "单词书不存在" }, { status: 404 });
  if (book.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  // 若正在导入，先请求停止；等待其退出当前 AI 调用
  if (book.status === "queued" || book.status === "processing") {
    requestStop(id);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 删除磁盘上的音频文件
  const words = await prisma.word.findMany({
    where: { unit: { bookId: id } },
    select: { audioWord: true, audioEx1: true, audioEx2: true },
  });
  for (const w of words) {
    for (const f of [w.audioWord, w.audioEx1, w.audioEx2]) {
      if (!f) continue;
      try {
        fs.unlinkSync(path.join(AUDIO_DIR, f));
      } catch { /* 文件可能不存在，忽略 */ }
    }
  }

  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
