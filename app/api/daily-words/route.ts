import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { weekdaySlot } from "@/lib/daily-words";
import { AuthError, getSessionUser, requireAdmin } from "@/lib/session";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";
  if (includeInactive) {
    try {
      await requireAdmin();
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      return NextResponse.json({ error: "服务器错误" }, { status: 500 });
    }
  }
  const resources = await prisma.dailyWordResource.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: { daySlot: "asc" },
  });
  const slot = weekdaySlot(searchParams.get("date"));
  const today = resources.find((resource) => resource.daySlot === slot) ?? resources[0] ?? null;

  return NextResponse.json({
    today,
    resources,
  });
}
