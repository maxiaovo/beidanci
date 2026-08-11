import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { isAllowSkipReview } from "@/lib/settings";

// 跳过当天复习门禁（管理员开启"允许跳过复习"后可用），每次跳过留痕给管理员查看
// body.module: "words"（默认，单词复习）| "writing"（写作复练），两种门禁互不影响
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  if (!(await isAllowSkipReview())) {
    return NextResponse.json({ error: "管理员未允许跳过复习" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const skipModule = body?.module === "writing" ? "writing" : "words";

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const existing = await prisma.reviewSkip.findFirst({
    where: { userId: user.id, module: skipModule, createdAt: { gte: start } },
  });
  if (!existing) {
    // 记录跳过时的待复习数，便于家长后台查看；这些词/错点不会被清掉，会累积到下次复习
    const count = skipModule === "writing"
      ? await prisma.writingMemoryItem.count({
          where: { userId: user.id, status: "active", nextReviewAt: { lte: new Date() } },
        })
      : await prisma.wordProgress.count({
          where: { userId: user.id, nextReviewAt: { lte: new Date() } },
        });
    await prisma.reviewSkip.create({ data: { userId: user.id, module: skipModule, count } });
  }
  return NextResponse.json({ ok: true });
}
