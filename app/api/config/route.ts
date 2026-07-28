import { NextResponse } from "next/server";
import { getSiteTitle, isRegistrationOpen, isStrictCheck } from "@/lib/settings";
import { findSiteIcon } from "@/lib/site";

// 公开配置：注册开关、站点标题 / 图标、强检查开关
export async function GET() {
  return NextResponse.json({
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
  });
}
