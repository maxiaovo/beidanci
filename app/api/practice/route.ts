import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";

// 自由练习：从学过的词里随机抽 20 个；没学过则抽全书随机
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const progresses = await prisma.wordProgress.findMany({
    where: { userId: user.id },
    select: { wordId: true },
  });
  const learnedIds = progresses.map((p) => p.wordId);

  const pool = await prisma.word.findMany({
    where: {
      unit: { book: bookVisibleWhere(user.id) },
      ...(learnedIds.length ? { id: { in: learnedIds } } : {}),
    },
    select: {
      id: true, text: true, phonetic: true, pos: true, meaningCn: true,
      audioWord: true,
      unit: { select: { title: true, book: { select: { id: true, name: true } } } },
    },
  });

  // 打乱取 20
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 20);

  // 干扰项池：同书其他词的中文释义
  const distractorPool = await prisma.word.findMany({
    where: { unit: { book: bookVisibleWhere(user.id) } },
    select: { meaningCn: true },
    take: 500,
  });

  return NextResponse.json({
    words: shuffled.map((w) => ({
      id: w.id,
      text: w.text,
      phonetic: w.phonetic,
      pos: w.pos,
      meaningCn: w.meaningCn,
      audioWord: w.audioWord,
      bookId: w.unit.book.id,
      bookName: w.unit.book.name,
      unitTitle: w.unit.title,
    })),
    distractors: distractorPool.map((d) => d.meaningCn),
  });
}
