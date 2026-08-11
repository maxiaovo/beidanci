import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";

// 批量分配 / 取消分配词书
// body: { bookIds: string[], userIds?: string[], all?: boolean, action: "assign" | "unassign" }
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const bookIds: string[] = Array.isArray(body?.bookIds) ? body.bookIds.filter((x: unknown) => typeof x === "string") : [];
  const userIds: string[] = Array.isArray(body?.userIds) ? body.userIds.filter((x: unknown) => typeof x === "string") : [];
  const all = body?.all === true;
  const action = body?.action;

  if (!bookIds.length || (action !== "assign" && action !== "unassign")) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  if (!all && !userIds.length) {
    return NextResponse.json({ error: "请选择分配对象" }, { status: 400 });
  }

  if (all) {
    await prisma.book.updateMany({
      where: { id: { in: bookIds } },
      data: { sharedWithAll: action === "assign" },
    });
  }

  if (userIds.length) {
    if (action === "assign") {
      // SQLite 不支持 skipDuplicates，先删再插实现幂等
      await prisma.bookAssignment.deleteMany({
        where: { bookId: { in: bookIds }, userId: { in: userIds } },
      });
      await prisma.bookAssignment.createMany({
        data: bookIds.flatMap((bookId) => userIds.map((userId) => ({ bookId, userId }))),
      });
      // 被分配的书自动加入学习：只补插缺失的 enrollment，不动已有记录（保留加入时间）
      const existing = await prisma.bookEnrollment.findMany({
        where: { bookId: { in: bookIds }, userId: { in: userIds } },
        select: { bookId: true, userId: true },
      });
      const existingKeys = new Set(existing.map((e) => `${e.bookId}:${e.userId}`));
      const missing = bookIds.flatMap((bookId) =>
        userIds
          .filter((userId) => !existingKeys.has(`${bookId}:${userId}`))
          .map((userId) => ({ bookId, userId })),
      );
      if (missing.length) {
        await prisma.bookEnrollment.createMany({ data: missing });
      }
    } else {
      await prisma.bookAssignment.deleteMany({
        where: { bookId: { in: bookIds }, userId: { in: userIds } },
      });
      // 取消分配：一并移出学习并清掉该书的每日计划（学习记录保留）；
      // 但书若是用户自己导入的，保留其 enrollment
      const owned = await prisma.book.findMany({
        where: { id: { in: bookIds }, ownerId: { in: userIds } },
        select: { id: true, ownerId: true },
      });
      const ownedKeys = new Set(owned.map((b) => `${b.id}:${b.ownerId}`));
      const pairs = bookIds
        .flatMap((bookId) => userIds.map((userId) => ({ bookId, userId })))
        .filter((p) => !ownedKeys.has(`${p.bookId}:${p.userId}`));
      if (pairs.length) {
        await prisma.bookEnrollment.deleteMany({ where: { OR: pairs } });
        await prisma.bookPlan.deleteMany({ where: { OR: pairs } });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
