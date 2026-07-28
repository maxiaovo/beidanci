import { NextResponse } from "next/server";
import { isRegistrationOpen } from "@/lib/settings";

// 公开配置：注册开关等
export async function GET() {
  return NextResponse.json({ registrationOpen: await isRegistrationOpen() });
}
