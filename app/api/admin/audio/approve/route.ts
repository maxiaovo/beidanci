import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { approveBookAudio } from "@/lib/import-runner";

// 批准某本书批量生成音频：POST { bookId } → requireAdmin → approveBookAudio
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const bookId = typeof body.bookId === "string" ? body.bookId : "";
  if (!bookId) return NextResponse.json({ error: "缺少 bookId" }, { status: 400 });
  const r = await approveBookAudio(bookId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
