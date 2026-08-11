"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet } from "./admin-utils";

// 系统更新（从个人设置页迁移到管理后台；调 /api/update）
export default function SystemUpdate() {
  const [version, setVersion] = useState("");
  const [latest, setLatest] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updMsg, setUpdMsg] = useState("");
  const [updating, setUpdating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  function stopPoll() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  // 轮询更新进度，直到完成 / 失败
  function startPoll() {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch("/api/update");
        const d = await r.json();
        const st = d.status?.state;
        if (st === "done") {
          stopPoll();
          setUpdating(false);
          setUpdateAvailable(false);
          setVersion(d.current);
          setUpdMsg(`✓ 已更新到 v${d.current}`);
        } else if (st === "failed") {
          stopPoll();
          setUpdating(false);
          setUpdMsg(`更新失败：${d.status?.message || "未知错误"}`);
        } else {
          setUpdMsg(d.status?.message || "正在更新…");
        }
      } catch {
        setUpdMsg("正在重启服务，请稍候…");
      }
    }, 3000);
  }

  useEffect(() => {
    // 读取当前版本与更新状态；若有进行中的更新则继续轮询
    adminGet("/api/update", router).then(async (r) => {
      if (!r) return;
      const ud = await r.json();
      setVersion(ud.current);
      const st = ud.status?.state;
      if (["downloading", "building", "restarting"].includes(st)) {
        setUpdating(true);
        setUpdMsg(ud.status?.message || "正在更新…");
        startPoll();
      } else if (st === "failed") {
        setUpdMsg(`上次更新失败：${ud.status?.message || "未知错误"}`);
      }
      checkUpdate(true);
    });
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function checkUpdate(silent = false) {
    setChecking(true);
    if (!silent) setUpdMsg("");
    try {
      const r = await fetch("/api/update?check=1");
      const d = await r.json();
      setVersion(d.current);
      if (d.latest === null) {
        if (!silent) setUpdMsg("无法连接 GitHub 检查更新");
      } else {
        setLatest(d.latest);
        setUpdateAvailable(d.updateAvailable);
        if (!silent) setUpdMsg(d.updateAvailable ? `发现新版本 v${d.latest}` : "当前已是最新版本");
      }
    } catch {
      if (!silent) setUpdMsg("检查更新失败");
    }
    setChecking(false);
  }

  async function startUpdate() {
    setUpdating(true);
    setUpdMsg("正在启动更新…");
    const r = await fetch("/api/update", { method: "POST" });
    const d = await r.json();
    if (r.ok) {
      setUpdMsg("正在下载最新版本…");
      startPoll();
    } else {
      setUpdating(false);
      setUpdMsg(d.error || "启动更新失败");
    }
  }

  return (
    <section className="bg-white rounded-2xl shadow p-5 flex flex-col gap-3">
      <h2 className="font-bold text-xl">系统更新</h2>
      <div className="text-sm text-black/50">
        当前版本 v{version || "…"}
        {latest && updateAvailable && !updating && (
          <span className="text-[#e0704a] ml-2">发现新版本 v{latest}</span>
        )}
      </div>
      {updMsg && (
        <div className={`text-sm ${updMsg.startsWith("✓") ? "text-green-600" : updMsg.includes("失败") || updMsg.includes("无法") ? "text-red-500" : "text-black/60"}`}>
          {updMsg}
        </div>
      )}
      {updating ? (
        <div className="text-sm text-black/40">更新过程中请勿关闭服务，完成后会自动重启。</div>
      ) : updateAvailable ? (
        <button
          onClick={startUpdate}
          className="bg-[#e0704a] text-white rounded-xl py-2.5 font-bold hover:opacity-90 w-fit px-6"
        >
          立即更新到 v{latest}
        </button>
      ) : (
        <button
          onClick={() => checkUpdate()}
          disabled={checking}
          className="border border-black/15 rounded-xl py-2.5 font-bold hover:bg-black/5 disabled:opacity-50 w-fit px-6"
        >
          {checking ? "检查中…" : "检查更新"}
        </button>
      )}
    </section>
  );
}
