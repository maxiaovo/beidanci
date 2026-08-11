import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { bookVisibleWhere, bookEnrolledWhere } from "@/lib/book-access";

// 学习计划：每本书的每日新词量配置
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const plans = await prisma.bookPlan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { book: { select: { id: true, name: true } } },
  });
  const result = [];
  for (const p of plans) {
    const totalWords = await prisma.word.count({ where: { unit: { bookId: p.bookId } } });
    result.push({
      id: p.id,
      bookId: p.bookId,
      bookName: p.book.name,
      amountType: p.amountType,
      wordsPerDay: p.wordsPerDay,
      fractionDen: p.fractionDen,
      totalWords,
    });
  }
  return NextResponse.json({ plans: result });
}

// 全量替换当前用户的学习计划
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.plans)) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }

  // 只有"在学"的词书才能配置计划（一次取回）
  const visibleBooks = await prisma.book.findMany({
    where: { ...bookVisibleWhere(user.id), ...bookEnrolledWhere(user.id) },
    select: { id: true },
  });
  const visibleIds = new Set(visibleBooks.map((b) => b.id));

  const seen = new Set<string>();
  const entries: { bookId: string; amountType: string; wordsPerDay: number; fractionDen: number }[] = [];
  for (const raw of body.plans) {
    const { bookId, amountType, wordsPerDay, fractionDen } = raw ?? {};
    if (typeof bookId !== "string" || !visibleIds.has(bookId)) {
      return NextResponse.json({ error: "词书不存在或未加入学习" }, { status: 400 });
    }
    if (seen.has(bookId)) {
      return NextResponse.json({ error: "同一本书不能重复设置计划" }, { status: 400 });
    }
    if (!["words", "fraction"].includes(amountType)) {
      return NextResponse.json({ error: "amountType 必须是 words 或 fraction" }, { status: 400 });
    }
    if (!Number.isInteger(wordsPerDay) || wordsPerDay < 1 || wordsPerDay > 200) {
      return NextResponse.json({ error: "wordsPerDay 必须是 1-200 的整数" }, { status: 400 });
    }
    if (!Number.isInteger(fractionDen) || fractionDen < 2 || fractionDen > 10) {
      return NextResponse.json({ error: "fractionDen 必须是 2-10 的整数" }, { status: 400 });
    }
    seen.add(bookId);
    entries.push({ bookId, amountType, wordsPerDay, fractionDen });
  }

  await prisma.$transaction([
    prisma.bookPlan.deleteMany({ where: { userId: user.id } }),
    prisma.bookPlan.createMany({
      data: entries.map((e) => ({ userId: user.id, ...e })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}
