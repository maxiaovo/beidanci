import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { isAllowSkipReview } from "@/lib/settings";

// 跳过当天复习门禁（管理员开启"允许跳过复习"后可用），每次跳过留痕给管理员查看
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  if (!(await isAllowSkipReview())) {
    return NextResponse.json({ error: "管理员未允许跳过复习" }, { status: 403 });
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const existing = await prisma.reviewSkip.findFirst({
    where: { userId: user.id, createdAt: { gte: start } },
  });
  if (!existing) {
    // 记录跳过时的待复习词数，便于家长后台查看；这些词不会被清掉，会累积到下次复习
    const dueCount = await prisma.wordProgress.count({
      where: { userId: user.id, nextReviewAt: { lte: new Date() } },
    });
    await prisma.reviewSkip.create({ data: { userId: user.id, count: dueCount } });
  }
  return NextResponse.json({ ok: true });
}
