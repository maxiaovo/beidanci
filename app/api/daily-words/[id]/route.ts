import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { saveDailyWordImage } from "@/lib/daily-words";
import { synthesize } from "@/lib/tts";

const CATEGORIES = new Set(["plant", "land", "marine", "bird", "nature"]);

async function adminOrForbidden() {
  try {
    await requireAdmin();
    return null;
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = await adminOrForbidden();
  if (forbidden) return forbidden;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const current = await prisma.dailyWordResource.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "资源不存在" }, { status: 404 });

  const data: {
    word?: string;
    phonetic?: string;
    category?: string;
    imageAlt?: string;
    active?: boolean;
  } = {};
  if (typeof body.word === "string" && body.word.trim()) data.word = body.word.trim().slice(0, 80);
  if (typeof body.phonetic === "string") data.phonetic = body.phonetic.trim().slice(0, 120);
  if (typeof body.imageAlt === "string") data.imageAlt = body.imageAlt.trim().slice(0, 200);
  if (typeof body.category === "string" && CATEGORIES.has(body.category)) data.category = body.category;
  if (typeof body.active === "boolean") data.active = body.active;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  const resource = await prisma.dailyWordResource.update({ where: { id }, data });
  return NextResponse.json({ ok: true, resource });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = await adminOrForbidden();
  if (forbidden) return forbidden;

  const { id } = await params;
  const current = await prisma.dailyWordResource.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "资源不存在" }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const image = form?.get("image") as File | null;
    if (!image || image.size === 0) {
      return NextResponse.json({ error: "请选择图片" }, { status: 400 });
    }
    try {
      const imageFile = await saveDailyWordImage(id, image, current.imageFile);
      const resource = await prisma.dailyWordResource.update({
        where: { id },
        data: { imageFile },
      });
      return NextResponse.json({ ok: true, resource });
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  const body = await req.json().catch(() => ({}));
  if (body.action !== "tts") {
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  }
  const audioFile = `daily_${id.replace(/[^\w-]/g, "-")}.wav`;
  const generated = await synthesize(current.word, audioFile, {
    instruction: typeof body.instruction === "string" && body.instruction.trim()
      ? body.instruction.trim()
      : undefined,
    altText: typeof body.altText === "string" && body.altText.trim()
      ? body.altText.trim()
      : undefined,
  });
  if (!generated) {
    return NextResponse.json({ error: "TTS 生成失败，请检查语音设置" }, { status: 502 });
  }
  const resource = await prisma.dailyWordResource.update({
    where: { id },
    data: { audioFile: generated },
  });
  return NextResponse.json({ ok: true, resource });
}
