import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessChild } from "@/lib/session";
import { serializeReport } from "@/lib/study-report";

// 查看单份报告（前端轮询生成进度也走这里）：本人或其家长/管理员可见
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const report = await prisma.studyReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 });
  if (report.userId !== viewer.id && !(await canAccessChild(viewer, report.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // 兜底：长时间卡在 generating（如生成中途服务重启）标记为失败，避免前端永远等待
  if (report.status === "generating" && Date.now() - report.createdAt.getTime() > 10 * 60 * 1000) {
    const stale = await prisma.studyReport.update({
      where: { id },
      data: { status: "failed", error: "生成超时，请重新生成" },
    });
    return NextResponse.json(serializeReport(stale));
  }

  return NextResponse.json(serializeReport(report));
}
