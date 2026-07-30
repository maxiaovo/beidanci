import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { extractText, splitIntoUnits } from "@/lib/parsers";
import { enqueueImport } from "@/lib/import-runner";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "缺少文件" }, { status: 400 });

  // 管理员可在导入时分配给用户：assignAll=true 或 assignTo=[userId,...]
  let assignAll = false;
  let assignTo: string[] = [];
  if (user.role === "admin") {
    assignAll = form.get("assignAll") === "true";
    try {
      const parsed = JSON.parse((form.get("assignTo") as string | null) || "[]");
      if (Array.isArray(parsed)) assignTo = parsed.filter((x) => typeof x === "string");
    } catch { /* 忽略非法 JSON，按无分配处理 */ }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractText(file.name, buffer);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const defaultName = file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  const bookName = (form.get("bookName") as string | null)?.trim() || defaultName;

  const units = splitIntoUnits(text);
  const book = await prisma.book.create({
    data: {
      name: bookName,
      ownerId: user.id,
      status: "queued",
      sharedWithAll: assignAll,
      rawUnits: JSON.stringify(units), // 存原始文本，导入中断后可断点续传
    },
  });
  if (assignTo.length) {
    // 新书无历史分配，不会重复
    await prisma.bookAssignment.createMany({
      data: assignTo.map((userId) => ({ bookId: book.id, userId })),
    });
  }

  // 后台串行队列跑分析+音频，前端轮询状态
  enqueueImport(book.id, units);

  return NextResponse.json({ ok: true, bookId: book.id, units: units.length });
}
