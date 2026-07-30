import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { isAllowSkipReview } from "@/lib/settings";

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const wordSelect = {
  id: true, text: true, phonetic: true, pos: true, meaningCn: true, meaningEn: true,
  segments: true, mnemonic: true,
  example1: true, example1Cn: true, example2: true, example2Cn: true,
  audioWord: true, audioEx1: true, audioEx2: true,
  unit: { select: { title: true, book: { select: { id: true, name: true } } } },
} as const;

function serializeWord(w: {
  segments: string;
  unit: { title: string; book: { id: string; name: string } };
  [k: string]: unknown;
}) {
  const { unit, segments, ...rest } = w;
  return {
    ...rest,
    segments: JSON.parse(segments || "[]"),
    unitTitle: unit.title,
    bookId: unit.book.id,
    bookName: unit.book.name,
  };
}

// 今日学习队列：先复习（门禁），后新词
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const now = new Date();
  const start = todayStart();

  // 到期复习词（今日额度内）
  const dueProgress = await prisma.wordProgress.findMany({
    where: { userId: user.id, nextReviewAt: { lte: now } },
    orderBy: { nextReviewAt: "asc" },
    take: user.dailyReviewTarget,
    include: { word: { select: wordSelect } },
  });

  // 今日已完成的复习数（用于显示进度）
  const reviewsDoneToday = await prisma.studyLog.count({
    where: { userId: user.id, mode: { startsWith: "check" }, result: { in: ["correct", "giveup"] }, createdAt: { gte: start } },
  });
  const learnedToday = await prisma.studyLog.count({
    where: { userId: user.id, mode: "learn", createdAt: { gte: start } },
  });

  const reviews = dueProgress.map((p) => ({
    progressId: p.id,
    stage: p.stage,
    ...serializeWord(p.word as never),
  }));

  // 新词：复习清完（或当天已跳过复习）才下发
  let newWords: ReturnType<typeof serializeWord>[] = [];
  const skippedToday =
    (await prisma.reviewSkip.count({ where: { userId: user.id, createdAt: { gte: start } } })) > 0;
  const reviewsCleared = reviews.length === 0 || skippedToday;
  if (reviewsCleared) {
    const remaining = Math.max(0, user.dailyNewTarget - learnedToday);
    if (remaining > 0) {
      const learned = await prisma.wordProgress.findMany({
        where: { userId: user.id },
        select: { wordId: true },
      });
      const learnedIds = learned.map((l) => l.wordId);
      const fresh = await prisma.word.findMany({
        where: {
          id: learnedIds.length ? { notIn: learnedIds } : undefined,
          unit: { book: { ...bookVisibleWhere(user.id), status: "ready" } },
        },
        orderBy: [{ unit: { book: { createdAt: "asc" } } }, { unit: { orderIndex: "asc" } }, { orderIndex: "asc" }],
        take: remaining,
        select: wordSelect,
      });
      newWords = fresh.map((w) => serializeWord(w as never));
    }
  }

  return NextResponse.json({
    reviewsCleared,
    reviews,
    newWords,
    stats: {
      dueCount: reviews.length,
      reviewsDoneToday,
      learnedToday,
      dailyNewTarget: user.dailyNewTarget,
      dailyReviewTarget: user.dailyReviewTarget,
      defaultCheckMode: user.defaultCheckMode,
      allowSkipReview: await isAllowSkipReview(),
    },
  });
}
