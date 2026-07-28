import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { saveSiteIcon } from "@/lib/site";

// 管理员上传网站图标（multipart）
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const icon = form?.get("icon") as File | null;
  if (!icon || icon.size === 0) {
    return NextResponse.json({ error: "请选择图标文件" }, { status: 400 });
  }
  try {
    const fileName = await saveSiteIcon(icon);
    return NextResponse.json({ ok: true, icon: fileName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
