import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";

// 全部词书 + 归属与分配情况（管理员）
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
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
      owner: b.owner,
      assignedTo: b.assignments.map((a) => a.user),
    })),
  });
}
