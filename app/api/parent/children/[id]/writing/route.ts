import { NextResponse } from "next/server";
import { getSessionUser, canAccessChild } from "@/lib/session";
import { getWritingOverview } from "@/lib/writing-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessChild(viewer, id))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  return NextResponse.json(await getWritingOverview(id));
}
