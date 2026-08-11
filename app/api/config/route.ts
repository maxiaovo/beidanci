import { NextResponse } from "next/server";
import { getCheckAppearance, getLearnAppearance, getSiteTitle, isRegistrationOpen, isStrictCheck } from "@/lib/settings";
import { findSiteIcon } from "@/lib/site";

// 公开配置：注册开关、站点标题 / 图标、强检查开关、学习页/检查页外观（卡片宽度等全局设置）
export async function GET() {
  return NextResponse.json({
    registrationOpen: await isRegistrationOpen(),
    strictCheck: await isStrictCheck(),
    siteTitle: await getSiteTitle(),
    hasSiteIcon: !!findSiteIcon(),
    appearance: await getLearnAppearance(),
    checkAppearance: await getCheckAppearance(),
  });
}
