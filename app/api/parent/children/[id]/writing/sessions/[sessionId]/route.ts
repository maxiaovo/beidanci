import { NextResponse } from "next/server";
import { getSessionUser, canAccessChild } from "@/lib/session";
import { getWritingSessionForViewer } from "@/lib/writing-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; sessionId: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id, sessionId } = await ctx.params;
  if (!(await canAccessChild(viewer, id))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const session = await getWritingSessionForViewer(sessionId, id, true);
  if (!session) return NextResponse.json({ error: "练习不存在" }, { status: 404 });
  return NextResponse.json({ session });
}
