import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { requestStop } from "@/lib/import-runner";
import { AUDIO_DIR } from "@/lib/tts";
import { saveBookCover, deleteBookCover } from "@/lib/book-covers";

// 单词列表浏览：书 → 单元 → 单词
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
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

// 修改单词书：书名仅管理员可改（纯显示名，关联全部走 id，不影响任何用户的学习记录）；
// 封皮由导入该书的用户或管理员上传/清除（formData: name? / cover? / removeCover?）
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "单词书不存在" }, { status: 404 });

  const isAdmin = user.role === "admin";
  const isOwner = book.ownerId === user.id;
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "无权操作" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "参数错误" }, { status: 400 });

  const data: { name?: string; coverFile?: string | null } = {};

  const name = (form.get("name") as string | null)?.trim();
  if (name) {
    if (!isAdmin) return NextResponse.json({ error: "只有管理员可以修改书名" }, { status: 403 });
    if (name.length > 100) return NextResponse.json({ error: "书名过长" }, { status: 400 });
    data.name = name;
  }

  const cover = form.get("cover");
  if (cover instanceof File && cover.size > 0) {
    try {
      data.coverFile = await saveBookCover(book.id, cover, book.coverFile);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  } else if (form.get("removeCover") === "true" && book.coverFile) {
    deleteBookCover(book.coverFile);
    data.coverFile = null;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "没有要修改的内容" }, { status: 400 });

  const updated = await prisma.book.update({ where: { id }, data });
  return NextResponse.json({ ok: true, name: updated.name, hasCover: !!updated.coverFile });
}

// 删除单词书：先停止导入，再删除音频文件与数据库记录（单元/单词/进度/日志级联删除）
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await params;

  const book = await prisma.book.findUnique({ where: { id } });
  if (!book) return NextResponse.json({ error: "单词书不存在" }, { status: 404 });
  if (book.ownerId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  // 若正在导入，先把书置为 deleting 并请求停止：import-runner 在每轮 AI/TTS 调用之间
  // 发现状态非 processing 会干净退出（不再写库），无需 sleep 等待
  if (book.status === "queued" || book.status === "processing") {
    await prisma.book.update({ where: { id }, data: { status: "deleting" } });
    requestStop(id);
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

  // 删除磁盘上的封皮
  deleteBookCover(book.coverFile);

  await prisma.book.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
