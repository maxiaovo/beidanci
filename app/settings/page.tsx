"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [checkMode, setCheckMode] = useState("spell");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarMsg, setAvatarMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      const d = await r.json();
      if (!d.user) return router.push("/login");
      setNewTarget(d.user.dailyNewTarget);
      setReviewTarget(d.user.dailyReviewTarget);
      setCheckMode(d.user.defaultCheckMode);
      setAvatarUrl(d.user.avatarUrl);
    });
  }, [router]);

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

  async function save() {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyNewTarget: Number(newTarget),
        dailyReviewTarget: Number(reviewTarget),
        defaultCheckMode: checkMode,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            className="w-16 h-16 rounded-full border-2 border-dashed border-black/20 overflow-hidden flex items-center justify-center hover:border-[#A8D8EA] transition-colors shrink-0"
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
        <div>
          <label className="text-sm text-black/60 block mb-1">每日新词目标（1-200）</label>
          <input
            type="number"
            min={1}
            max={200}
            value={newTarget}
            onChange={(e) => setNewTarget(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-[#A8D8EA]"
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
            className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-[#A8D8EA]"
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
                  checkMode === o.v ? "bg-[#2d2a32] text-white border-transparent" : "border-black/15"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={save}
          className="bg-[#2d2a32] text-white rounded-xl py-2.5 font-bold hover:opacity-90"
        >
          {saved ? "✓ 已保存" : "保存"}
        </button>
      </div>
    </div>
  );
}
