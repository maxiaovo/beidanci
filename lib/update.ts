import fs from "fs";
import path from "path";

// GitHub 仓库（公开），版本以 main 分支 package.json 的 version 为准
export const REPO = "maxiaovo/beidanci";

const STATUS_FILE = path.join(process.cwd(), "data", "update-status.json");

export type UpdateStatus = {
  state: "idle" | "downloading" | "building" | "restarting" | "done" | "failed";
  message?: string;
  target?: string;
  updatedAt?: number; // 秒级时间戳
};

export function localVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// 从 GitHub 读取 main 分支的版本号；网络失败返回 null
export async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${REPO}/main/package.json`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const pkg = await res.json();
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

// 语义化版本比较：a<b 返回 -1，a==b 返回 0，a>b 返回 1
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function readStatus(): UpdateStatus {
  try {
    return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
  } catch {
    return { state: "idle" };
  }
}

export function writeStatus(s: UpdateStatus) {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...s, updatedAt: Math.floor(Date.now() / 1000) }));
  } catch {
    // 状态文件写失败不阻断主流程
  }
}

// 实际生效的状态：服务重启后版本号已追上 target，视为更新完成
export function effectiveStatus(): UpdateStatus {
  const s = readStatus();
  if (s.state === "restarting" && s.target && compareVersions(localVersion(), s.target) >= 0) {
    return { ...s, state: "done", message: `已更新到 v${s.target}` };
  }
  return s;
}
