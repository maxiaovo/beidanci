import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";

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
