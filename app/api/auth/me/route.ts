import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getEffectiveDailyTargets } from "@/lib/settings";
import { themeStateFromDb } from "@/lib/theme";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  const targets = await getEffectiveDailyTargets(user);
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      parentCanLearn: user.parentCanLearn,
      avatarUrl: user.avatarUrl,
      dailyNewTarget: targets.dailyNewTarget,
      dailyReviewTarget: targets.dailyReviewTarget,
      // 个人覆写标记：非 null 即用户自己改过
      customDailyNewTarget: user.dailyNewTarget,
      customDailyReviewTarget: user.dailyReviewTarget,
      defaultCheckMode: user.defaultCheckMode,
      theme: themeStateFromDb(user.themePreset, user.themeCustom),
    },
  });
}
