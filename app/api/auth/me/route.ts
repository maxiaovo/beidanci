import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      dailyNewTarget: user.dailyNewTarget,
      dailyReviewTarget: user.dailyReviewTarget,
      defaultCheckMode: user.defaultCheckMode,
    },
  });
}
