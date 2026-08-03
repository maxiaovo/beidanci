import fs from "fs";
import { NextResponse } from "next/server";
import { findDailyWordImage } from "@/lib/daily-words";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const image = findDailyWordImage(name);
  if (!image) {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }
  const buffer = fs.readFileSync(image.path);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
