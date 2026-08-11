import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { bookVisibleWhere } from "@/lib/book-access";

const SAMPLE_SIZE = 20;
// 手动"已掌握"会把 nextReviewAt 推到约 +10 年；超过 5 年即视为手动掌握，自由练习不再抽它
const MASTERED_HORIZON_MS = 5 * 365 * 24 * 3600 * 1000;

type PracticeRow = {
  id: string;
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  audioWord: string | null;
  unitTitle: string;
  bookId: string;
  bookName: string;
};

// 可见性条件与 bookVisibleWhere 保持一致：自己的书 | 全员共享 | 分配给自己
const VISIBLE_SQL = `
  (b.ownerId = ? OR b.sharedWithAll = 1
   OR EXISTS (SELECT 1 FROM BookAssignment a WHERE a.bookId = b.id AND a.userId = ?))`;

// 自由练习：从学过的词里 SQL 层随机抽 20 个；没学过则抽全书随机
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const masteredCutoff = BigInt(Date.now() + MASTERED_HORIZON_MS);
  const selectCols = `
    SELECT w.id, w.text, w.phonetic, w.pos, w.meaningCn, w.audioWord,
           u.title AS unitTitle, b.id AS bookId, b.name AS bookName
    FROM Word w
    JOIN Unit u ON w.unitId = u.id
    JOIN Book b ON u.bookId = b.id`;

  // 优先从已学词抽样（排除手动已掌握）
  let rows = await prisma.$queryRawUnsafe<PracticeRow[]>(
    `${selectCols}
     JOIN WordProgress p ON p.wordId = w.id AND p.userId = ?
     WHERE ${VISIBLE_SQL} AND p.nextReviewAt <= ?
     ORDER BY RANDOM() LIMIT ${SAMPLE_SIZE}`,
    user.id, user.id, user.id, masteredCutoff,
  );

  // 没有已学词（或全被手动掌握）则回退：全部可见词随机抽
  if (rows.length === 0) {
    rows = await prisma.$queryRawUnsafe<PracticeRow[]>(
      `${selectCols}
       WHERE ${VISIBLE_SQL}
       ORDER BY RANDOM() LIMIT ${SAMPLE_SIZE}`,
      user.id, user.id,
    );
  }

  // 干扰项池：同书其他词的中文释义
  const distractorPool = await prisma.word.findMany({
    where: { unit: { book: bookVisibleWhere(user.id) } },
    select: { meaningCn: true },
    take: 500,
  });

  return NextResponse.json({
    words: rows.map((w) => ({
      id: w.id,
      text: w.text,
      phonetic: w.phonetic,
      pos: w.pos,
      meaningCn: w.meaningCn,
      audioWord: w.audioWord,
      bookId: w.bookId,
      bookName: w.bookName,
      unitTitle: w.unitTitle,
    })),
    distractors: distractorPool.map((d) => d.meaningCn),
  });
}
