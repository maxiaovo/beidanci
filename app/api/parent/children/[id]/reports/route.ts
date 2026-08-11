import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessChild } from "@/lib/session";
import { createStudyReport, isReportRange, ReportError, serializeReport } from "@/lib/study-report";

// 家长查看孩子的报告列表
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await canAccessChild(viewer, id))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const reports = await prisma.studyReport.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ reports: reports.map(serializeReport) });
}

// 家长给孩子生成学习报告（可选时间段；与孩子本人触发的次数合并计入每日限额）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  if (!(await canAccessChild(viewer, id))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!isReportRange(body.range)) {
    return NextResponse.json({ error: "无效的时间段" }, { status: 400 });
  }
  try {
    const reportId = await createStudyReport(id, body.range, viewer.id);
    return NextResponse.json({ id: reportId });
  } catch (error) {
    if (error instanceof ReportError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
