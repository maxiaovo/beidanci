import { NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { findBookCover } from "@/lib/book-covers";
import { canAccessBook } from "@/lib/book-access";

// 读取单词书封皮；未上传时 404，前端用文字封皮兜底
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  if (!(await canAccessBook(user, id))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const book = await prisma.book.findUnique({ where: { id }, select: { coverFile: true } });
  if (!book?.coverFile) return NextResponse.json({ error: "无封皮" }, { status: 404 });

  const cover = findBookCover(book.coverFile);
  if (!cover) return NextResponse.json({ error: "封皮文件缺失" }, { status: 404 });

  return new NextResponse(fs.readFileSync(cover.path), {
    headers: {
      "Content-Type": cover.mime,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
