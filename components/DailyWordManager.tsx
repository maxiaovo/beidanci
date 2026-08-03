"use client";

import { useEffect, useState } from "react";
import {
  FloppyDisk,
  ImageSquare,
  SpeakerHigh,
  SpinnerGap,
  Waveform,
} from "@phosphor-icons/react";

export interface DailyWordResource {
  id: string;
  daySlot: number;
  word: string;
  phonetic: string;
  category: string;
  imageAlt: string;
  imageFile: string;
  audioFile: string | null;
  active: boolean;
  updatedAt: string;
}

const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const CATEGORY_NAMES: Record<string, string> = {
  plant: "植物",
  land: "陆地动物",
  marine: "海洋动物",
  bird: "飞鸟",
  nature: "自然",
};

export default function DailyWordManager({ title = "每日自然单词" }: { title?: string }) {
  const [resources, setResources] = useState<DailyWordResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/daily-words?all=1", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (cancelled) return;
      if (response.ok) setResources(data.resources ?? []);
      else setMessage(data.error || "加载失败");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(id: string, patch: Partial<DailyWordResource>) {
    setResources((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function save(item: DailyWordResource) {
    setBusy((current) => ({ ...current, [item.id]: "save" }));
    const response = await fetch(`/api/daily-words/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word: item.word,
        phonetic: item.phonetic,
        category: item.category,
        imageAlt: item.imageAlt,
        active: item.active,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      update(item.id, data.resource);
      setMessage(`✓ ${DAY_NAMES[item.daySlot]}已保存`);
    } else {
      setMessage(data.error || "保存失败");
    }
    setBusy((current) => ({ ...current, [item.id]: "" }));
  }

  async function uploadImage(item: DailyWordResource, file?: File) {
    if (!file) return;
    setBusy((current) => ({ ...current, [item.id]: "image" }));
    const form = new FormData();
    form.append("image", file);
    const response = await fetch(`/api/daily-words/${item.id}`, { method: "POST", body: form });
    const data = await response.json();
    if (response.ok) {
      update(item.id, data.resource);
      setMessage(`✓ ${DAY_NAMES[item.daySlot]}图片已替换`);
    } else {
      setMessage(data.error || "图片上传失败");
    }
    setBusy((current) => ({ ...current, [item.id]: "" }));
  }

  async function generateTts(item: DailyWordResource) {
    setBusy((current) => ({ ...current, [item.id]: "tts" }));
    const response = await fetch(`/api/daily-words/${item.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tts" }),
    });
    const data = await response.json();
    if (response.ok) {
      update(item.id, data.resource);
      setMessage(`✓ ${item.word} 发音已生成`);
    } else {
      setMessage(data.error || "TTS 生成失败");
    }
    setBusy((current) => ({ ...current, [item.id]: "" }));
  }

  function play(item: DailyWordResource) {
    if (!item.audioFile) return;
    const audio = new Audio(`/api/audio/${encodeURIComponent(item.audioFile)}?v=${Date.now()}`);
    void audio.play();
  }

  return (
    <section className="rounded-[2rem] border border-black/6 bg-white/80 p-5 shadow-[0_16px_45px_rgba(58,46,92,0.08)] sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-accent">统一资源库</div>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-black/48">首页按星期自动轮换。这里修改的图片、单词、音标与发音会同步生效。</p>
        </div>
        {message && <span className="rounded-full bg-black/5 px-3 py-1.5 text-sm text-black/60">{message}</span>}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-black/45"><SpinnerGap className="animate-spin" /> 加载资源…</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {resources.map((item) => {
            const state = busy[item.id];
            return (
              <article key={item.id} className="grid gap-4 rounded-3xl border border-black/7 bg-white p-4 sm:grid-cols-[11rem_1fr]">
                <div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black/4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/daily-words/images/${encodeURIComponent(item.imageFile)}?v=${encodeURIComponent(item.updatedAt)}`}
                      alt={item.imageAlt || item.word}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <label className="mt-2 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-black/10 text-sm font-bold transition hover:bg-black/4">
                    {state === "image" ? <SpinnerGap className="animate-spin" /> : <ImageSquare />}
                    {state === "image" ? "上传中…" : "替换图片"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={!!state}
                      onChange={(event) => void uploadImage(item, event.target.files?.[0])}
                    />
                  </label>
                </div>

                <div className="grid content-start gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">{DAY_NAMES[item.daySlot]}</span>
                    <label className="flex items-center gap-2 text-xs text-black/50">
                      <input type="checkbox" checked={item.active} onChange={(event) => update(item.id, { active: event.target.checked })} />
                      启用
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-black/50">单词
                      <input value={item.word} onChange={(event) => update(item.id, { word: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 text-base font-bold outline-none focus:ring-2 focus:ring-accent" />
                    </label>
                    <label className="text-xs text-black/50">音标
                      <input value={item.phonetic} onChange={(event) => update(item.id, { phonetic: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 outline-none focus:ring-2 focus:ring-accent" />
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-xs text-black/50">类别
                      <select value={item.category} onChange={(event) => update(item.id, { category: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-accent">
                        {Object.entries(CATEGORY_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-black/50">图片说明
                      <input value={item.imageAlt} onChange={(event) => update(item.id, { imageAlt: event.target.value })} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2 outline-none focus:ring-2 focus:ring-accent" />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" onClick={() => void save(item)} disabled={!!state} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-3.5 text-sm font-bold text-white disabled:opacity-45">
                      {state === "save" ? <SpinnerGap className="animate-spin" /> : <FloppyDisk />} 保存
                    </button>
                    <button type="button" onClick={() => void generateTts(item)} disabled={!!state} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-accent px-3.5 text-sm font-bold text-accent disabled:opacity-45">
                      {state === "tts" ? <SpinnerGap className="animate-spin" /> : <Waveform />} {item.audioFile ? "重新生成发音" : "生成发音"}
                    </button>
                    <button type="button" onClick={() => play(item)} disabled={!item.audioFile} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/10 px-3.5 text-sm font-bold disabled:opacity-35">
                      <SpeakerHigh /> 试听
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
