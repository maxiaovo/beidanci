"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  applyThemeVars,
  DEFAULT_THEME,
  getPreset,
  getThemeVars,
  hexColor,
  THEME_PRESETS,
  type ThemeState,
  type ThemeVars,
} from "@/lib/theme";

const CUSTOM_KEYS: { key: keyof ThemeVars; label: string }[] = [
  { key: "background", label: "页面背景" },
  { key: "foreground", label: "主文字" },
  { key: "accent", label: "主强调色" },
  { key: "accent2", label: "次强调色" },
];

export default function SettingsPage() {
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [checkMode, setCheckMode] = useState("spell");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 主题
  const [theme, setTheme] = useState<ThemeState>(DEFAULT_THEME);

  // 系统更新（仅管理员）
  const [isAdmin, setIsAdmin] = useState(false);
  const [version, setVersion] = useState("");
  const [latest, setLatest] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updMsg, setUpdMsg] = useState("");
  const [updating, setUpdating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    fetch("/api/auth/me").then(async (r) => {
      const d = await r.json();
      if (!d.user) return router.push("/login");
      setNewTarget(d.user.dailyNewTarget);
      setReviewTarget(d.user.dailyReviewTarget);
      setCheckMode(d.user.defaultCheckMode);
      setAvatarUrl(d.user.avatarUrl);
      const loadedTheme: ThemeState = d.user.theme || DEFAULT_THEME;
      setTheme(loadedTheme);
      applyThemeVars(getThemeVars(loadedTheme));
      if (d.user.role === "admin") {
        setIsAdmin(true);
        // 读取当前版本与更新状态；若有进行中的更新则继续轮询
        const ur = await fetch("/api/update");
        const ud = await ur.json();
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
      }
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

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.append("avatar", f);
    const res = await fetch("/api/settings", { method: "POST", body: form });
    const d = await res.json();
    if (res.ok) {
      setAvatarUrl(d.avatarUrl);
      setAvatarMsg("✓ 头像已更新");
      router.refresh();
    } else {
      setAvatarMsg(d.error || "上传失败");
    }
    setTimeout(() => setAvatarMsg(""), 2500);
  }

  function selectPreset(id: string) {
    const next: ThemeState = { ...theme, presetId: id };
    if (id !== "custom") {
      next.custom = getPreset(id)?.vars ?? DEFAULT_THEME.custom;
    }
    setTheme(next);
    applyThemeVars(getThemeVars(next));
  }

  function updateCustom(key: keyof ThemeVars, value: string) {
    const clean = hexColor(value);
    const next: ThemeState = {
      ...theme,
      presetId: "custom",
      custom: { ...theme.custom, [key]: clean },
    };
    setTheme(next);
    applyThemeVars(getThemeVars(next));
  }

  async function save() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyNewTarget: Number(newTarget),
        dailyReviewTarget: Number(reviewTarget),
        defaultCheckMode: checkMode,
        theme,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="font-bold text-2xl mb-6">设置</h1>
      <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-5">
        {/* 头像 */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-full border-2 border-dashed border-black/20 overflow-hidden flex items-center justify-center hover:border-accent transition-colors shrink-0"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/avatars/${avatarUrl}?t=${Date.now()}`} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <span className="text-black/40 text-xs">上传头像</span>
            )}
          </button>
          <div className="text-sm text-black/50">
            点击头像可更换
            {avatarMsg && <div className="text-green-600 mt-1">{avatarMsg}</div>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={uploadAvatar}
            className="hidden"
          />
        </div>

        {/* 主题 */}
        <div>
          <label className="text-sm text-black/60 block mb-2">配色主题</label>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${
                  theme.presetId === p.id
                    ? "border-accent bg-accent/10"
                    : "border-black/10 hover:bg-black/[.02]"
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${p.vars.accent} 50%, ${p.vars.background} 50%)`,
                  }}
                />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {theme.presetId === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            {CUSTOM_KEYS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-xs text-black/60">{label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.custom[key]}
                    onChange={(e) => updateCustom(key, e.target.value)}
                    className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={theme.custom[key]}
                    onChange={(e) => updateCustom(key, e.target.value)}
                    className="flex-1 border rounded-lg px-2 py-1.5 text-sm uppercase outline-none focus:ring-2 ring-accent"
                  />
                </div>
              </label>
            ))}
          </div>
        )}

        <div>
          <label className="text-sm text-black/60 block mb-1">每日新词目标（1-200）</label>
          <input
            type="number"
            min={1}
            max={200}
            value={newTarget}
            onChange={(e) => setNewTarget(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent"
          />
        </div>
        <div>
          <label className="text-sm text-black/60 block mb-1">每日复习上限（1-500）</label>
          <input
            type="number"
            min={1}
            max={500}
            value={reviewTarget}
            onChange={(e) => setReviewTarget(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent"
          />
        </div>
        <div>
          <label className="text-sm text-black/60 block mb-1">复习时默认检查方式</label>
          <div className="flex gap-2">
            {[
              { v: "spell", label: "拼写检查" },
              { v: "choice", label: "选择检查" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setCheckMode(o.v)}
                className={`flex-1 rounded-lg py-2 border ${
                  checkMode === o.v ? "bg-foreground text-white border-transparent" : "border-black/15"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={save}
          className="bg-foreground text-white rounded-xl py-2.5 font-bold hover:opacity-90"
        >
          {saved ? "✓ 已保存" : "保存"}
        </button>
      </div>

      {/* 系统更新（仅管理员） */}
      {isAdmin && (
        <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-3 mt-6">
          <div className="font-bold">系统更新</div>
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
              className="bg-[#e0704a] text-white rounded-xl py-2.5 font-bold hover:opacity-90"
            >
              立即更新到 v{latest}
            </button>
          ) : (
            <button
              onClick={() => checkUpdate()}
              disabled={checking}
              className="border border-black/15 rounded-xl py-2.5 font-bold hover:bg-black/5 disabled:opacity-50"
            >
              {checking ? "检查中…" : "检查更新"}
            </button>
          )}
        </div>
      )}

      {/* 快捷入口（手机端底部 Tab 栏收起了这些页面） */}
      <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-1 mt-6 sm:hidden">
        <Link href="/import" className="py-2.5 flex items-center justify-between text-sm hover:opacity-70">
          📥 导入单词书 <span className="text-black/30">›</span>
        </Link>
        {isAdmin && (
          <Link href="/admin" className="py-2.5 flex items-center justify-between text-sm border-t border-black/5 hover:opacity-70">
            🛠 后台管理 <span className="text-black/30">›</span>
          </Link>
        )}
        <button
          onClick={logout}
          className="py-2.5 flex items-center justify-between text-sm text-red-500 border-t border-black/5"
        >
          退出登录 <span className="text-black/30">›</span>
        </button>
      </div>
    </div>
  );
}
