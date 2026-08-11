"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet } from "./admin-utils";

// 站点设置：网站标题 + 网站图标
export default function SiteInfo() {
  const [siteTitle, setSiteTitle] = useState("");
  const [hasIcon, setHasIcon] = useState(false);
  const [iconVer, setIconVer] = useState(0);
  const [siteMsg, setSiteMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/config", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      setSiteTitle(d.siteTitle ?? "");
      setHasIcon(!!d.hasSiteIcon);
      setLoaded(true);
    });
  }, [router]);

  useEffect(load, [load]);

  async function saveSite() {
    setSiteMsg("");
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteTitle }),
    });
    const d = await r.json();
    if (r.ok) {
      setSiteTitle(d.siteTitle);
      setSiteMsg("✓ 已保存");
    } else {
      setSiteMsg(d.error || "保存失败");
    }
    setTimeout(() => setSiteMsg(""), 3000);
  }

  async function uploadIcon(file: File) {
    setSiteMsg("");
    const form = new FormData();
    form.append("icon", file);
    const r = await fetch("/api/admin/site-icon", { method: "POST", body: form });
    const d = await r.json();
    if (r.ok) {
      setHasIcon(true);
      setIconVer((v) => v + 1);
      setSiteMsg("✓ 图标已更新");
    } else {
      setSiteMsg(d.error || "上传失败");
    }
    setTimeout(() => setSiteMsg(""), 3000);
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <section className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-xl">站点设置</h2>
        {siteMsg && <span className="text-sm text-green-600">{siteMsg}</span>}
      </div>
      <div className="flex flex-col gap-4 max-w-3xl">
        <div className="flex gap-4 flex-wrap items-end">
          <label className="text-sm text-black/60 flex-1 min-w-56">
            网站标题
            <input
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
              placeholder="背单词"
            />
          </label>
          <div className="text-sm text-black/60">
            网站图标
            <div className="mt-1 flex items-center gap-3">
              <button
                onClick={() => iconInputRef.current?.click()}
                className="w-10 h-10 rounded-lg border-2 border-dashed border-black/20 overflow-hidden flex items-center justify-center hover:border-accent transition-colors"
                title="点击上传图标"
              >
                {hasIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/site-icon?v=${iconVer}`} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-black/30 text-lg">+</span>
                )}
              </button>
              <span className="text-xs text-black/40">png / ico / svg，不超过 2MB</span>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadIcon(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>
        <button
          onClick={saveSite}
          className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
        >
          保存站点设置
        </button>
        <p className="text-xs text-black/40">标题留空并保存可恢复默认「背单词」。图标上传后立即生效。</p>
      </div>
    </section>
  );
}
