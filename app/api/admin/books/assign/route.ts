import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 批量分配 / 取消分配词书
// body: { bookIds: string[], userIds?: string[], all?: boolean, action: "assign" | "unassign" }
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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
    } else {
      await prisma.bookAssignment.deleteMany({
        where: { bookId: { in: bookIds }, userId: { in: userIds } },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
