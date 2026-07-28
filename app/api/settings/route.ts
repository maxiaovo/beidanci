import { NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { saveAvatar, findAvatarFile } from "@/lib/avatars";
import { hexColor, type ThemeVars } from "@/lib/theme";

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (Number.isInteger(body.dailyNewTarget) && body.dailyNewTarget >= 1 && body.dailyNewTarget <= 200) {
    data.dailyNewTarget = body.dailyNewTarget;
  }
  if (Number.isInteger(body.dailyReviewTarget) && body.dailyReviewTarget >= 1 && body.dailyReviewTarget <= 500) {
    data.dailyReviewTarget = body.dailyReviewTarget;
  }
  if (["spell", "choice"].includes(body.defaultCheckMode)) {
    data.defaultCheckMode = body.defaultCheckMode;
  }

  // 主题设置
  if (typeof body.theme === "object" && body.theme !== null) {
    const { presetId, custom } = body.theme;
    const validPresets = new Set(["purple", "green", "blue", "warm", "dark", "custom"]);
    if (validPresets.has(presetId)) {
      data.themePreset = presetId;
      if (presetId === "custom" && custom && typeof custom === "object") {
        const cleaned: ThemeVars = {
          background: hexColor(String(custom.background)),
          foreground: hexColor(String(custom.foreground)),
          accent: hexColor(String(custom.accent)),
          accent2: hexColor(String(custom.accent2)),
        };
        data.themeCustom = JSON.stringify(cleaned);
      } else if (presetId !== "custom") {
        // 使用预设时，清空自定义数据以节省空间
        data.themeCustom = null;
      }
    }
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true });
}

// 上传/更换头像（multipart）
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const avatar = form?.get("avatar") as File | null;
  if (!avatar || avatar.size === 0) {
    return NextResponse.json({ error: "请选择头像图片" }, { status: 400 });
  }
  try {
    if (user.avatarUrl) {
      const old = findAvatarFile(user.avatarUrl);
      if (old) fs.unlinkSync(old);
    }
    const avatarUrl = await saveAvatar(user.id, avatar);
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    return NextResponse.json({ ok: true, avatarUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
