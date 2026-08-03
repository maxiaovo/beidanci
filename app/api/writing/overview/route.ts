import { NextResponse } from "next/server";
import { getSessionUser, isParent } from "@/lib/session";
import { getWritingOverview } from "@/lib/writing-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  return NextResponse.json(await getWritingOverview(user.id));
}
