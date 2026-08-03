"use client";

import { useEffect, useMemo, useState } from "react";

interface PromptEntry {
  key: string;
  title: string;
  description: string;
  prompt: string;
  defaultPrompt: string;
  overridden: boolean;
}

interface ResourceStat {
  resources: number;
  cacheHits: number;
}

export default function AdminAiPrompts() {
  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const [stats, setStats] = useState<Record<string, ResourceStat>>({});
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState("");
  const [debugInput, setDebugInput] = useState("");
  const [debugOutput, setDebugOutput] = useState("");
  const [debugCached, setDebugCached] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "reset" | "debug" | "">("load");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai-prompts").then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "读取提示词失败");
      setPrompts(data.prompts ?? []);
      setStats(data.stats ?? {});
      const first = data.prompts?.[0];
      if (first) {
        setSelectedKey(first.key);
        setDraft(first.prompt);
      }
    }).catch((error) => setMessage(error instanceof Error ? error.message : "读取提示词失败"))
      .finally(() => setBusy(""));
  }, []);

  const selected = useMemo(() => prompts.find((item) => item.key === selectedKey) ?? null, [prompts, selectedKey]);

  function selectPrompt(entry: PromptEntry) {
    setSelectedKey(entry.key);
    setDraft(entry.prompt);
    setDebugInput("");
    setDebugOutput("");
    setDebugCached(null);
    setMessage("");
  }

  async function updatePrompt(prompt: string, action: "save" | "reset") {
    if (!selected) return;
    setBusy(action);
    setMessage("");
    const response = await fetch("/api/admin/ai-prompts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selected.key, prompt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "保存失败");
    } else if (data.prompt) {
      setPrompts((current) => current.map((item) => item.key === data.prompt.key ? data.prompt : item));
      setDraft(data.prompt.prompt);
      setMessage(action === "reset" ? "已恢复默认提示词" : "已保存，新调用立即使用");
    }
    setBusy("");
  }

  async function debugPrompt() {
    if (!selected || !debugInput.trim()) return;
    setBusy("debug");
    setMessage("");
    setDebugOutput("");
    setDebugCached(null);
    const response = await fetch("/api/admin/ai-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: selected.key, prompt: draft, input: debugInput }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "调试失败");
    } else {
      setDebugOutput(data.output ?? "");
      setDebugCached(Boolean(data.cached));
      setStats((current) => {
        const existing = current[selected.key] ?? { resources: 0, cacheHits: 0 };
        return {
          ...current,
          [selected.key]: data.cached
            ? { ...existing, cacheHits: existing.cacheHits + 1 }
            : { ...existing, resources: existing.resources + 1 },
        };
      });
    }
    setBusy("");
  }

  if (busy === "load") return <div className="rounded-2xl bg-white p-8 text-center text-black/45 shadow">正在读取 AI 提示词…</div>;

  return (
    <section className="rounded-2xl bg-white p-5 shadow">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">AI 提示词实验室</h1>
          <p className="mt-1 max-w-3xl text-sm text-black/50">每个 DeepSeek 功能独立配置。提示词、模型或输入变化会自动生成新的缓存键；相同请求直接复用已有资源。</p>
        </div>
        {message && <div className={`rounded-lg px-3 py-2 text-sm ${message.includes("失败") || message.includes("错误") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>{message}</div>}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-2" aria-label="AI 功能提示词">
          {prompts.map((entry) => {
            const stat = stats[entry.key] ?? { resources: 0, cacheHits: 0 };
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => selectPrompt(entry)}
                className={`rounded-xl border p-3 text-left transition ${selectedKey === entry.key ? "border-accent bg-accent/5" : "border-black/8 hover:border-black/20"}`}
              >
                <span className="block font-bold">{entry.title}</span>
                <span className="mt-1 block font-mono text-[11px] text-black/35">{entry.key}</span>
                <span className="mt-2 block text-xs text-black/45">资源 {stat.resources} · 复用 {stat.cacheHits} 次</span>
              </button>
            );
          })}
        </nav>

        {selected && (
          <div className="min-w-0">
            <div className="rounded-xl bg-black/[.035] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">{selected.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${selected.overridden ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{selected.overridden ? "已自定义" : "使用默认"}</span>
              </div>
              <p className="mt-2 text-sm text-black/55">{selected.description}</p>
            </div>

            <label className="mt-4 block text-sm font-bold">
              系统提示词
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={18}
                spellCheck={false}
                className="mt-2 w-full rounded-xl border border-black/10 p-4 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" disabled={Boolean(busy) || !draft.trim()} onClick={() => updatePrompt(draft, "save")} className="rounded-xl bg-foreground px-5 py-2.5 font-bold text-white disabled:opacity-40">{busy === "save" ? "保存中…" : "保存提示词"}</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => updatePrompt("", "reset")} className="rounded-xl border border-black/10 px-5 py-2.5 font-bold disabled:opacity-40">{busy === "reset" ? "恢复中…" : "恢复默认"}</button>
            </div>

            <div className="mt-7 border-t border-black/8 pt-6">
              <h3 className="text-lg font-black">用当前草稿调试</h3>
              <p className="mt-1 text-sm text-black/45">无需先保存。可粘贴真实的文本或 JSON 上下文；相同草稿和输入再次运行会直接命中资源缓存。</p>
              <textarea
                value={debugInput}
                onChange={(event) => setDebugInput(event.target.value)}
                rows={7}
                placeholder={selected.key === "vocabulary.unit_analysis" ? "粘贴一段教材单元原文…" : "粘贴该功能的测试输入；JSON 可以直接粘贴…"}
                className="mt-3 w-full rounded-xl border border-black/10 p-4 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent"
              />
              <button type="button" disabled={Boolean(busy) || !draft.trim() || !debugInput.trim()} onClick={debugPrompt} className="mt-3 rounded-xl bg-accent px-5 py-2.5 font-bold text-white disabled:opacity-40">{busy === "debug" ? "DeepSeek 正在运行…" : "运行调试"}</button>
              {debugOutput && (
                <div className="mt-4 rounded-xl border border-black/8 bg-slate-950 p-4 text-slate-100">
                  <div className="mb-3 flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold">模型输出</span>
                    <span className={debugCached ? "text-green-300" : "text-sky-300"}>{debugCached ? "命中缓存资源" : "新生成并已缓存"}</span>
                  </div>
                  <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{debugOutput}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
