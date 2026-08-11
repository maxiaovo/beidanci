import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

// 站点版本号：取自当前构建的 .next/BUILD_ID。
// 客户端 VersionChecker 定期请求本接口，发现版本变化即刷新页面，
// 避免浏览器长期展示旧缓存页面（如旧版管理后台）。
let cachedVersion: string | null = null;

function currentVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
  } catch {
    // dev 模式或构建产物缺失：退化为本次进程启动时间，同一进程内保持稳定
    cachedVersion = `run-${Date.now()}`;
  }
  return cachedVersion;
}

export async function GET() {
  return NextResponse.json(
    { version: currentVersion() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
