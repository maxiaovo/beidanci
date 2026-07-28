import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { MAX_STAGE } from "@/lib/scheduler";

// 我的单词书列表（含被分配的）+ 每本进度
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const books = await prisma.book.findMany({
    where: bookVisibleWhere(user.id),
    orderBy: { createdAt: "asc" },
    include: { units: { include: { _count: { select: { words: true } } } } },
  });

  const result = [];
  for (const b of books) {
    const wordIds = b.units.length
      ? (await prisma.word.findMany({ where: { unit: { bookId: b.id } }, select: { id: true } })).map((w) => w.id)
      : [];
    const total = wordIds.length;
    const learned = total
      ? await prisma.wordProgress.count({ where: { userId: user.id, wordId: { in: wordIds } } })
      : 0;
    const mastered = total
      ? await prisma.wordProgress.count({ where: { userId: user.id, wordId: { in: wordIds }, stage: { gte: MAX_STAGE } } })
      : 0;
    result.push({
      id: b.id,
      name: b.name,
      status: b.status,
      audioDone: b.audioDone,
      audioTotal: b.audioTotal,
      analyzeDone: b.analyzeDone,
      analyzeTotal: b.analyzeTotal,
      sharedWithAll: b.sharedWithAll,
      mine: b.ownerId === user.id,
      createdAt: b.createdAt,
      total,
      learned,
      mastered,
      units: b.units.length,
    });
  }
  return NextResponse.json({ books: result });
}
