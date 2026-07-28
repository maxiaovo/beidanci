import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { deletePackage, packageInfo } from "@/lib/package-book";

// 服务器端打包文件管理：查询 / 删除
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  return NextResponse.json(packageInfo(id));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const { id } = await params;
  const deleted = deletePackage(id);
  return NextResponse.json({ ok: true, deleted });
}
