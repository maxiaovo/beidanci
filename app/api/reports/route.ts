import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { createStudyReport, isReportRange, ReportError, serializeReport } from "@/lib/study-report";

// 学习者本人：生成自己的学习报告（复习结束后触发）
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!isReportRange(body.range)) {
    return NextResponse.json({ error: "无效的时间段" }, { status: 400 });
  }
  try {
    const id = await createStudyReport(user.id, body.range, user.id);
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

// 学习者本人：自己的报告列表
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const reports = await prisma.studyReport.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ reports: reports.map(serializeReport) });
}
