import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/lib/session";
import {
  localVersion,
  latestVersion,
  compareVersions,
  writeStatus,
  effectiveStatus,
} from "@/lib/update";

// 查询当前版本与更新状态；?check=1 时同时向 GitHub 检查新版本
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const current = localVersion();
  const status = effectiveStatus();
  const body: Record<string, unknown> = { current, status };

  if (new URL(req.url).searchParams.get("check") === "1") {
    const latest = await latestVersion();
    body.latest = latest;
    body.updateAvailable = latest ? compareVersions(latest, current) > 0 : false;
  }
  return NextResponse.json(body);
}

// 触发更新（仅管理员）：后台执行 scripts/update-server.sh
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const status = effectiveStatus();
  const running =
    ["downloading", "building", "restarting"].includes(status.state) &&
    Date.now() / 1000 - (status.updatedAt || 0) < 900;
  if (running) {
    return NextResponse.json({ error: "已有更新正在进行中" }, { status: 409 });
  }

  const latest = await latestVersion();
  if (!latest) {
    return NextResponse.json({ error: "无法连接 GitHub 获取最新版本" }, { status: 502 });
  }
  const current = localVersion();
  if (compareVersions(latest, current) <= 0) {
    return NextResponse.json({ error: "当前已是最新版本", latest }, { status: 400 });
  }

  writeStatus({ state: "downloading", message: "正在下载最新版本…", target: latest });

  // 复制脚本到 data/ 再执行，避免 rsync 同步时覆盖正在运行的脚本自身
  const runScript = path.join(process.cwd(), "data", ".update-run.sh");
  fs.copyFileSync(path.join(process.cwd(), "scripts", "update-server.sh"), runScript);
  const child = spawn("bash", [runScript], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env, TARGET_VERSION: latest },
  });
  child.unref();

  return NextResponse.json({ started: true, target: latest });
}
