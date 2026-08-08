import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AUDIO_DIR, synthesize } from "@/lib/tts";
import { registerAudioVersion } from "@/lib/audio-versions";

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
  const counts = await prisma.wordAudio.groupBy({
    by: ["wordId", "kind"],
    _count: { _all: true },
  });
  const countOf = new Map(counts.map((c) => [`${c.wordId}_${c.kind}`, c._count._all]));
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
      versionCount: {
        word: countOf.get(`${w.id}_word`) ?? 0,
        ex1: countOf.get(`${w.id}_ex1`) ?? 0,
        ex2: countOf.get(`${w.id}_ex2`) ?? 0,
      },
    })),
  });
}

// 重新生成某个单词的音频（kind: word | ex1 | ex2 | all，默认 all）
// 每次生成为新版本（时间戳文件名），登记进 WordAudio 并设为当前；旧版本保留可回切
// 生成成功的才更新当前版本；失败的保留原值
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

  // 可选：临时指令（覆盖默认 instruction）/ 替代拼写（仅影响读音，不改单词文本）
  const regenOpts = {
    instruction: typeof body.instruction === "string" && body.instruction.trim() ? body.instruction.trim() : undefined,
    altText: typeof body.altText === "string" && body.altText.trim() ? body.altText.trim() : undefined,
  };

  const failed: string[] = [];
  const reasons: Record<string, string> = {};
  // 时间戳保证每次生成都是新文件，不覆盖旧版本
  const ts = Date.now();
  const kinds: Array<{ k: "word" | "ex1" | "ex2"; text: string }> = [
    { k: "word", text: w.text },
    { k: "ex1", text: w.example1 },
    { k: "ex2", text: w.example2 },
  ];
  for (const { k, text } of kinds) {
    if (kind !== k && kind !== "all") continue;
    const out: { voice?: string; error?: string } = {};
    const a = await synthesize(text, `${w.id}_${k}_${ts}.wav`, { ...regenOpts, out });
    if (a) await registerAudioVersion(w.id, k, a, out.voice || "");
    else {
      failed.push(k);
      reasons[k] = out.error || "未知原因";
    }
  }
  const updated = await prisma.word.findUnique({
    where: { id: w.id },
    select: { audioWord: true, audioEx1: true, audioEx2: true },
  });
  return NextResponse.json({
    ok: failed.length === 0,
    failed,
    reasons,
    ...updated,
    fileWord: fileExists(updated?.audioWord),
    fileEx1: fileExists(updated?.audioEx1),
    fileEx2: fileExists(updated?.audioEx2),
  });
}
