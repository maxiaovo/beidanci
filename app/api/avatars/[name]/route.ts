import { NextResponse } from "next/server";
import fs from "fs";
import { findAvatarFile } from "@/lib/avatars";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const filePath = findAvatarFile(name);
  if (!filePath) return NextResponse.json({ error: "头像不存在" }, { status: 404 });
  const ext = name.split(".").pop() ?? "jpg";
  const buf = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": MIME[ext] ?? "image/jpeg", "Cache-Control": "public, max-age=3600" },
  });
}
