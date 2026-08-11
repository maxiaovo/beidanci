import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireAdmin } from "@/lib/session";

// 全部词书 + 归属与分配情况（管理员）
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }

  const books = await prisma.book.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { id: true, username: true } },
      assignments: { include: { user: { select: { id: true, username: true } } } },
      _count: { select: { units: true } },
    },
  });

  return NextResponse.json({
    books: books.map((b) => ({
      id: b.id,
      name: b.name,
      status: b.status,
      createdAt: b.createdAt,
      units: b._count.units,
      sharedWithAll: b.sharedWithAll,
      hasCover: !!b.coverFile,
      owner: b.owner,
      assignedTo: b.assignments.map((a) => a.user),
    })),
  });
}
