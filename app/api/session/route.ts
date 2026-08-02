import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";
import { isAllowSkipReview, getLearnAppearance } from "@/lib/settings";

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

interface PlanOut {
  bookId: string;
  bookName: string;
  amountType: string;
  wordsPerDay: number;
  fractionDen: number;
  quota: number;
  doneToday: number;
  remaining: number;
}

// 今日学习队列：先复习（门禁），后新词
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const now = new Date();
  const start = todayStart();
  const bookParam = new URL(req.url).searchParams.get("book");

  // 到期复习词（今日额度内）
  const dueProgress = await prisma.wordProgress.findMany({
    where: { userId: user.id, nextReviewAt: { lte: now } },
    orderBy: { nextReviewAt: "asc" },
    take: user.dailyReviewTarget,
    include: { word: { select: wordSelect } },
  });

  // 今日已完成的复习数（用于显示进度）
  const reviewedWordsToday = await prisma.studyLog.findMany({
    where: { userId: user.id, mode: { startsWith: "check" }, result: "correct", createdAt: { gte: start } },
    distinct: ["wordId"],
    select: { wordId: true },
  });
  const reviewsDoneToday = reviewedWordsToday.length;
  const learnedToday = await prisma.studyLog.count({
    where: { userId: user.id, mode: "learn", createdAt: { gte: start } },
  });

  const reviews = dueProgress.map((p) => ({
    progressId: p.id,
    stage: p.stage,
    ...serializeWord(p.word as never),
  }));

  // ?book= 校验：不可见时视为无效，对应新词为空（不报错）
  let bookFilterId: string | null = null;
  if (bookParam) {
    const visible = await prisma.book.findFirst({
      where: { id: bookParam, ...bookVisibleWhere(user.id) },
      select: { id: true },
    });
    if (visible) bookFilterId = bookParam;
  }

  // 新词：复习清完（或当天已跳过复习）才下发
  let newWords: ReturnType<typeof serializeWord>[] = [];
  const plansOut: PlanOut[] = [];
  const skippedToday =
    (await prisma.reviewSkip.count({ where: { userId: user.id, createdAt: { gte: start } } })) > 0;
  const reviewsCleared = reviews.length === 0 || skippedToday;

  const plans = await prisma.bookPlan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { book: { select: { name: true } } },
  });

  if (plans.length > 0) {
    // 有计划：按计划逐书配额下发新词
    const learned = await prisma.wordProgress.findMany({
      where: { userId: user.id },
      select: { wordId: true },
    });
    const learnedIds = learned.map((l) => l.wordId);
    const unlearnedCond = learnedIds.length ? { id: { notIn: learnedIds } } : {};

    for (const plan of plans) {
      // 今日该本书已学新词数
      const doneToday = await prisma.studyLog.count({
        where: {
          userId: user.id,
          mode: "learn",
          createdAt: { gte: start },
          word: { unit: { bookId: plan.bookId } },
        },
      });

      let quota: number;
      if (plan.amountType === "words") {
        quota = plan.wordsPerDay;
      } else {
        // 分数模式：找到第一个还有未学词的单元，配额 = ceil(单元词数 / fractionDen)
        const unit = await prisma.unit.findFirst({
          where: { bookId: plan.bookId, words: { some: unlearnedCond } },
          orderBy: { orderIndex: "asc" },
          include: { words: { select: { id: true } } },
        });
        quota = unit ? Math.max(1, Math.ceil(unit.words.length / plan.fractionDen)) : 0;
      }

      const remaining = Math.max(0, quota - doneToday);
      plansOut.push({
        bookId: plan.bookId,
        bookName: plan.book.name,
        amountType: plan.amountType,
        wordsPerDay: plan.wordsPerDay,
        fractionDen: plan.fractionDen,
        quota,
        doneToday,
        remaining,
      });

      // ?book= 指定时只取该书的词；指定的书不可见则一个都不取
      const wantThisBook = !bookParam || bookFilterId === plan.bookId;
      if (reviewsCleared && remaining > 0 && wantThisBook) {
        const fresh = await prisma.word.findMany({
          where: {
            id: learnedIds.length ? { notIn: learnedIds } : undefined,
            unit: { bookId: plan.bookId },
          },
          orderBy: [{ unit: { orderIndex: "asc" } }, { orderIndex: "asc" }],
          take: remaining,
          select: wordSelect,
        });
        newWords.push(...fresh.map((w) => serializeWord(w as never)));
      }
    }

    // 兜底：用户主动选了一本没有每日计划的书，按每日新词目标下发该书的新词
    if (reviewsCleared && bookFilterId && !plans.some((p) => p.bookId === bookFilterId)) {
      const remaining = Math.max(0, user.dailyNewTarget - learnedToday);
      if (remaining > 0) {
        const fresh = await prisma.word.findMany({
          where: {
            id: learnedIds.length ? { notIn: learnedIds } : undefined,
            unit: { bookId: bookFilterId },
          },
          orderBy: [{ unit: { orderIndex: "asc" } }, { orderIndex: "asc" }],
          take: remaining,
          select: wordSelect,
        });
        newWords.push(...fresh.map((w) => serializeWord(w as never)));
      }
    }
  } else if (reviewsCleared) {
    // 无计划：保持原全局 dailyNewTarget 行为
    const remaining = Math.max(0, user.dailyNewTarget - learnedToday);
    const bookBlocked = bookParam !== null && bookFilterId === null;
    if (remaining > 0 && !bookBlocked) {
      const learned = await prisma.wordProgress.findMany({
        where: { userId: user.id },
        select: { wordId: true },
      });
      const learnedIds = learned.map((l) => l.wordId);
      const fresh = await prisma.word.findMany({
        where: {
          id: learnedIds.length ? { notIn: learnedIds } : undefined,
          unit: {
            book: {
              ...(bookFilterId ? { id: bookFilterId } : {}),
              ...bookVisibleWhere(user.id),
              status: "ready",
            },
          },
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
    plans: plansOut,
    appearance: await getLearnAppearance(), // 学习页外观（全局设置）
    stats: {
      dueCount: reviews.length,
      reviewsDoneToday,
      learnedToday,
      dailyNewTarget: user.dailyNewTarget,
      dailyReviewTarget: user.dailyReviewTarget,
      defaultCheckMode: user.defaultCheckMode,
      allowSkipReview: await isAllowSkipReview(),
      highlightColor: user.highlightColor ?? null,
    },
  });
}
