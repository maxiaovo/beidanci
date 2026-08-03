import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";

const LEVEL_KINDS = ["grade", "exam", "cefr", "custom", "unknown"];

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!LEVEL_KINDS.includes(body.levelKind)) return NextResponse.json({ error: "请选择有效的水平类型" }, { status: 400 });
  const value = typeof body.levelValue === "string" ? body.levelValue.trim().slice(0, 200) : "";
  if (body.levelKind !== "unknown" && !value) return NextResponse.json({ error: "请填写具体水平" }, { status: 400 });
  const score = typeof body.score === "string" ? body.score.trim().slice(0, 80) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 100) : "daily";
  const genres = Array.isArray(body.genres) ? body.genres.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) : [];
  const declaredContext = { levelKind: body.levelKind, value, score, note };
  const goals = { primary: goal, genres };
  const profile = await prisma.writingProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      declaredContext: JSON.stringify(declaredContext),
      goals: JSON.stringify(goals),
      assessmentStatus: "provisional",
      abilitySummary: body.levelKind === "unknown" ? "等待完成自适应写作摸底" : "已记录你的背景，将通过实际写作逐步校准",
    },
    update: {
      declaredContext: JSON.stringify(declaredContext),
      goals: JSON.stringify(goals),
      assessmentStatus: "provisional",
    },
  });
  return NextResponse.json({ profile });
}
