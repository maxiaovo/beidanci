import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getSessionUser, canAccessChild } from "@/lib/session";
import { REPORT_DIR } from "@/lib/study-report";

// 报告朗读音频：本人或其家长/管理员可听
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getSessionUser();
  if (!viewer) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;

  const report = await prisma.studyReport.findUnique({ where: { id } });
  if (!report?.audioFile) return NextResponse.json({ error: "音频不存在" }, { status: 404 });
  if (report.userId !== viewer.id && !(await canAccessChild(viewer, report.userId))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const base = path.basename(report.audioFile); // 防路径穿越
  const filePath = path.join(REPORT_DIR, base);
  if (base !== report.audioFile || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "音频不存在" }, { status: 404 });
  }
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
