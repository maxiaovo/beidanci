"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "app-build-version";
const POLL_INTERVAL_MS = 60_000;

// 版本检测：每次切换路由、每 60 秒、页面重新可见时向服务器核对构建版本。
// 发现服务器已是新版本（部署更新）而本页面仍是旧版时，自动刷新以加载新页面，
// 解决"部署后浏览器仍展示旧缓存界面"的问题。
export default function VersionChecker() {
  const pathname = usePathname();

  useEffect(() => {
    let stopped = false;

    async function check() {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version?: unknown };
        if (stopped || typeof version !== "string") return;
        const seen = sessionStorage.getItem(STORAGE_KEY);
        if (seen === version) return;
        sessionStorage.setItem(STORAGE_KEY, version);
        // 首次访问只记录版本；已有旧版本在运行才刷新
        if (seen) window.location.reload();
      } catch {
        /* 网络异常时跳过本轮，下轮再试 */
      }
    }

    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
