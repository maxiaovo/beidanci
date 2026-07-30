import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AUDIO_DIR } from "@/lib/tts";
import { resumeImport } from "@/lib/import-runner";

// 一键补齐全部缺失音频：找出有缺失（记录为空或文件不存在）的书，逐本断点续传
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const words = await prisma.word.findMany({
    where: { OR: [{ audioWord: null }, { audioEx1: null }, { audioEx2: null }] },
    select: { unit: { select: { bookId: true } } },
  });
  const bookIds = new Set(words.map((w) => w.unit.bookId));
  // 数据库有记录但文件丢失的情况也算缺失
  const withAudio = await prisma.word.findMany({
    where: { OR: [{ audioWord: { not: null } }, { audioEx1: { not: null } }, { audioEx2: { not: null } }] },
    select: { audioWord: true, audioEx1: true, audioEx2: true, unit: { select: { bookId: true } } },
  });
  for (const w of withAudio) {
    for (const name of [w.audioWord, w.audioEx1, w.audioEx2]) {
      if (name && !fs.existsSync(path.join(AUDIO_DIR, name))) {
        bookIds.add(w.unit.bookId);
        break;
      }
    }
  }

  let enqueued = 0;
  for (const id of bookIds) {
    const r = await resumeImport(id);
    if (r.ok) enqueued++;
  }
  return NextResponse.json({ ok: true, books: bookIds.size, enqueued });
}
