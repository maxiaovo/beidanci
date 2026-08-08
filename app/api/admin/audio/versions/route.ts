import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import {
  AUDIO_KINDS,
  type AudioKind,
  activateAudioVersion,
  activeAudioFile,
  deleteAudioVersion,
  listAudioVersions,
} from "@/lib/audio-versions";

// 音频版本管理：GET 列出 / POST 设为当前 / DELETE 删除（含文件，删当前自动切到剩余最新）
async function requireAdminOr403() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
}

export async function GET(req: Request) {
  const denied = await requireAdminOr403();
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const wordId = searchParams.get("wordId") || "";
  const kind = searchParams.get("kind") || "";
  if (!wordId || !AUDIO_KINDS.includes(kind as AudioKind)) {
    return NextResponse.json({ error: "缺少 wordId 或 kind 非法" }, { status: 400 });
  }
  const [versions, active] = await Promise.all([
    listAudioVersions(wordId, kind as AudioKind),
    activeAudioFile(wordId, kind as AudioKind),
  ]);
  return NextResponse.json({
    active,
    versions: versions.map((v) => ({
      id: v.id,
      file: v.file,
      voice: v.voice,
      createdAt: v.createdAt,
      active: v.file === active,
    })),
  });
}

export async function POST(req: Request) {
  const denied = await requireAdminOr403();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  if (!versionId) return NextResponse.json({ error: "缺少 versionId" }, { status: 400 });
  const v = await activateAudioVersion(versionId);
  if (!v) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, active: v.file });
}

export async function DELETE(req: Request) {
  const denied = await requireAdminOr403();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const versionId = typeof body.versionId === "string" ? body.versionId : "";
  if (!versionId) return NextResponse.json({ error: "缺少 versionId" }, { status: 400 });
  const r = await deleteAudioVersion(versionId);
  if (!r) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, active: r.active });
}
