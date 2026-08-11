"use client";

import { useCallback, useEffect, useState } from "react";

// 学习报告视图（与 lib/study-report.ts 的 serializeReport 对应）
interface ReportView {
  id: string;
  status: string; // generating | done | failed
  step: string; // collect | narrate | tts | done
  error: string;
  content: string;
  hasAudio: boolean;
  rangeStart: string;
  rangeEnd: string;
  createdAt: string;
}

const REPORT_STEPS = [
  { key: "collect", label: "汇总错词" },
  { key: "narrate", label: "AI 分析错因" },
  { key: "tts", label: "合成语音" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "3d", label: "近 3 天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

function fmtTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 家长端学习报告面板：为指定孩子生成（可选时间段）并查看历史报告
export default function ParentReportPanel({ childId, childName }: { childId: string; childName: string }) {
  const [reports, setReports] = useState<ReportView[]>([]);
  const [range, setRange] = useState("today");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingStep, setGeneratingStep] = useState("collect");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(`/api/parent/children/${childId}/reports`).then(async (r) => {
      if (r.ok) setReports((await r.json()).reports);
    });
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  // 轮询生成进度
  useEffect(() => {
    if (!generatingId) return;
    let stopped = false;
    const tick = async (timer: number) => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/reports/${generatingId}`);
        if (!r.ok || stopped) return;
        const d = (await r.json()) as ReportView;
        setGeneratingStep(d.step);
        if (d.status !== "generating") {
          stopped = true;
          window.clearInterval(timer);
          setGeneratingId(null);
          if (d.status === "failed") setError(d.error || "生成失败");
          void load();
        }
      } catch {
        // 网络抖动，下轮再试
      }
    };
    const timer = window.setInterval(() => void tick(timer), 2000);
    void tick(timer);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [generatingId, load]);

  async function generate() {
    setError("");
    const r = await fetch(`/api/parent/children/${childId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error || "生成失败，请稍后再试");
      return;
    }
    setGeneratingStep("collect");
    setGeneratingId(d.id);
  }

  const stepIndex = REPORT_STEPS.findIndex((s) => s.key === generatingStep);
  const progressPct = (Math.max(stepIndex, 0) + 1) / REPORT_STEPS.length * 100;

  return (
    <section className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-bold text-xl">{childName} 的学习报告</h2>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            disabled={!!generatingId}
            className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 ring-accent bg-white"
          >
            {RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={!!generatingId}
            className="bg-foreground text-white rounded-lg px-4 py-1.5 text-sm font-bold hover:opacity-90 disabled:opacity-40"
          >
            {generatingId ? "生成中…" : "生成学习报告"}
          </button>
        </div>
      </div>
      <p className="text-xs text-black/40 mb-4">AI 分析该时间段内答错/放弃的单词，生成错因精讲与语音讲解。每个孩子每天最多生成 2 次（孩子复习后自己生成的也计入）。</p>

      {generatingId && (
        <div className="mb-4 border border-accent/40 rounded-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-bold">正在生成：{REPORT_STEPS[Math.max(stepIndex, 0)]?.label ?? "汇总错词"}…</span>
            <span className="text-black/40 text-xs">通常需要 30 秒左右</span>
          </div>
          <div className="h-2 rounded-full bg-black/5 overflow-hidden">
            <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

      {reports.length === 0 && !generatingId ? (
        <p className="text-sm text-black/40">还没有学习报告</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="border rounded-xl p-3">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium">{fmtTime(r.createdAt)}</span>
                <span className="text-black/40 text-xs">
                  {fmtTime(r.rangeStart)} ~ {fmtTime(r.rangeEnd)}
                </span>
                {r.status === "generating" && <span className="text-xs text-accent">生成中…</span>}
                {r.status === "failed" && <span className="text-xs text-red-500">失败：{r.error}</span>}
                {r.status === "done" && (
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="ml-auto text-sm text-blue-500 underline"
                  >
                    {expandedId === r.id ? "收起" : "查看"}
                  </button>
                )}
              </div>
              {expandedId === r.id && r.status === "done" && (
                <div className="mt-3">
                  {r.hasAudio && <audio controls src={`/api/reports/${r.id}/audio`} className="w-full mb-3" />}
                  <div className="whitespace-pre-wrap break-words text-sm leading-6 text-black/70 bg-black/[.02] rounded-xl p-4 max-h-96 overflow-y-auto">
                    {r.content}
                  </div>
                  {r.error && <p className="text-xs text-orange-500 mt-2">{r.error}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
