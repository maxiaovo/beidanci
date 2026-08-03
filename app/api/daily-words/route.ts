import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { weekdaySlot } from "@/lib/daily-words";
import { requireAdmin } from "@/lib/session";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";
  if (includeInactive) {
    try {
      await requireAdmin();
    } catch {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
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
