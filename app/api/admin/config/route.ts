import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { isRegistrationOpen, setSetting } from "@/lib/settings";

// 管理员站点配置：注册开关
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return NextResponse.json({ registrationOpen: await isRegistrationOpen() });
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body.registrationOpen !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  await setSetting("registration_open", body.registrationOpen ? "true" : "false");
  return NextResponse.json({ ok: true, registrationOpen: body.registrationOpen });
}
