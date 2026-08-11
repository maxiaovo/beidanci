import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canLearn, getSessionUser } from "@/lib/session";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (!canLearn(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const profile = await prisma.writingProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {
      abilityBand: "",
      abilitySummary: "等待重新完成写作摸底",
      dimensions: "{}",
      strengths: "[]",
      weaknesses: "[]",
      evidence: "[]",
      assessmentStatus: "pending",
      completedTasks: 0,
      lastAssessedAt: null,
    },
  });
  return NextResponse.json({ profile });
}
