"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SegmentWord from "@/components/SegmentWord";
import FitWord from "@/components/FitWord";
import {
  APPEARANCE_RANGES,
  CHECK_APPEARANCE_RANGES,
  DEFAULT_APPEARANCE,
  DEFAULT_CHECK_APPEARANCE,
  clampPx,
  type CheckAppearance,
  type LearnAppearance,
} from "@/lib/appearance";
import { adminGet } from "./admin-utils";

// 外观设置：学习页外观 + 检查页外观（全局设置，对所有学习者生效）
export default function SiteAppearance() {
  const [appearance, setAppearance] = useState<LearnAppearance>(DEFAULT_APPEARANCE);
  const [apprSaved, setApprSaved] = useState(false);
  const [checkAppr, setCheckAppr] = useState<CheckAppearance>(DEFAULT_CHECK_APPEARANCE);
  const [checkSaved, setCheckSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/config", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      if (d.learnAppearance) setAppearance(d.learnAppearance);
      if (d.checkAppearance) setCheckAppr(d.checkAppearance);
      setLoaded(true);
    });
  }, [router]);

  useEffect(load, [load]);

  // 保存学习页外观（全局设置，对所有学习者生效）
  async function saveAppearance() {
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnAppearance: appearance }),
    });
    const d = await r.json();
    if (r.ok) {
      setAppearance(d.learnAppearance);
      setApprSaved(true);
      setTimeout(() => setApprSaved(false), 2000);
    }
  }

  // 保存检查页外观
  async function saveCheckAppearance() {
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkAppearance: checkAppr }),
    });
    const d = await r.json();
    if (r.ok) {
      setCheckAppr(d.checkAppearance);
      setCheckSaved(true);
      setTimeout(() => setCheckSaved(false), 2000);
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <>
      {/* 学习页外观 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">学习页外观</h2>
        </div>
        <div className="flex flex-col gap-4">
          {([
            { key: "wordSizePx", label: "单词字号", unit: "px" },
            { key: "segmentSizePx", label: "词根词缀字号", unit: "px" },
            { key: "sentenceSizePx", label: "例句字号", unit: "px" },
            { key: "sentenceCnSizePx", label: "例句中文字号", unit: "px" },
            { key: "cardWidthPct", label: "卡片宽度", unit: "%" },
          ] as const).map((row) => {
            const [min, max] = APPEARANCE_RANGES[row.key];
            return (
              <label key={row.key} className="flex items-center gap-3 text-sm text-black/60 max-w-3xl">
                <span className="w-28 shrink-0">{row.label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={appearance[row.key]}
                  onChange={(e) => setAppearance({ ...appearance, [row.key]: Number(e.target.value) })}
                  className="flex-1 accent-foreground"
                />
                <span className="w-16 shrink-0 text-right text-black/80 font-medium">
                  {appearance[row.key]}
                  {row.unit}
                </span>
              </label>
            );
          })}
          <div className="flex items-center gap-3">
            <button
              onClick={saveAppearance}
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
            >
              {apprSaved ? "✓ 已保存" : "保存外观设置"}
            </button>
            <span className="text-xs text-black/40">全局生效：保存后对所有学习者的学习页立即生效</span>
          </div>
          {/* 实时预览：外框模拟浏览器窗口，内部白卡宽度 = 卡片宽度设置 */}
          <div className="border border-black/10 rounded-2xl bg-black/[.03] p-4 sm:p-6 overflow-hidden">
            <div
              className="bg-white rounded-3xl shadow-lg p-6 mx-auto flex flex-col items-center justify-center gap-4"
              style={{
                width: `${appearance.cardWidthPct}%`,
                maxWidth: "100%",
                minHeight: `${Math.round(appearance.wordSizePx * 3)}px`,
              }}
            >
              <div className="font-bold tracking-wide max-w-full text-center">
                <FitWord text="apple" sizePx={appearance.wordSizePx} />
              </div>
              <div className="text-black/40 text-sm">/ˈæp.l/</div>
              <SegmentWord
                segments={[
                  { part: "re", type: "prefix", meaningCn: "重复" },
                  { part: "spect", type: "root", meaningCn: "看" },
                  { part: "ful", type: "suffix", meaningCn: "充满…的" },
                ]}
                sizePx={appearance.segmentSizePx}
              />
              <div className="text-center break-all" style={{ fontSize: clampPx(appearance.sentenceSizePx) }}>
                This is an apple.
              </div>
              <div className="text-black/50 text-center" style={{ fontSize: `${appearance.sentenceCnSizePx}px` }}>
                这是一个苹果。
              </div>
            </div>
          </div>
          <p className="text-xs text-black/40">预览随滑杆实时变化（无需保存）；窄屏下字号会按视口自动缩小，与学习页一致。</p>
        </div>
      </section>

      {/* 检查页外观 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">检查页外观</h2>
        </div>
        <div className="flex flex-col gap-4">
          {([
            { key: "wordSizePx", label: "单词字号", unit: "px" },
            { key: "optionSizePx", label: "选项字号", unit: "px" },
            { key: "cardWidthPct", label: "卡片宽度", unit: "%" },
          ] as const).map((row) => {
            const [min, max] = CHECK_APPEARANCE_RANGES[row.key];
            return (
              <label key={row.key} className="flex items-center gap-3 text-sm text-black/60 max-w-3xl">
                <span className="w-28 shrink-0">{row.label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={checkAppr[row.key]}
                  onChange={(e) => setCheckAppr({ ...checkAppr, [row.key]: Number(e.target.value) })}
                  className="flex-1 accent-foreground"
                />
                <span className="w-16 shrink-0 text-right text-black/80 font-medium">
                  {checkAppr[row.key]}
                  {row.unit}
                </span>
              </label>
            );
          })}
          <div className="flex items-center gap-3">
            <button
              onClick={saveCheckAppearance}
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
            >
              {checkSaved ? "✓ 已保存" : "保存检查页外观"}
            </button>
            <span className="text-xs text-black/40">全局生效：保存后对所有学习者的检查页立即生效</span>
          </div>
          {/* 实时预览：模拟选择检查卡片 */}
          <div className="border border-black/10 rounded-2xl bg-black/[.03] p-4 sm:p-6 overflow-hidden">
            <div
              className="bg-white rounded-3xl shadow-lg p-6 mx-auto flex flex-col items-center justify-center gap-5"
              style={{
                width: `${checkAppr.cardWidthPct}%`,
                maxWidth: "100%",
                minHeight: `${Math.round(checkAppr.wordSizePx * 3)}px`,
              }}
            >
              <div className="font-bold tracking-wide max-w-full text-center">
                <FitWord text="apple" sizePx={checkAppr.wordSizePx} />
              </div>
              <div className="text-black/40 text-sm">/ˈæp.l/</div>
              <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                {["苹果", "香蕉", "橙子", "葡萄"].map((t) => (
                  <div
                    key={t}
                    className="border border-black/15 rounded-xl py-2.5 text-center text-black/70"
                    style={{ fontSize: `${checkAppr.optionSizePx}px` }}
                  >
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-black/40">预览随滑杆实时变化（无需保存）；窄屏下字号会按视口自动缩小，与检查页一致。</p>
        </div>
      </section>
    </>
  );
}
