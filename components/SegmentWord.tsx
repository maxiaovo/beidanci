"use client";

import { MACARON, Segment } from "@/lib/client";

// 词根词缀分开展示：马卡龙配色 + 缓缓分开动画 + 每段中文释义
export default function SegmentWord({ segments, big = true }: { segments: Segment[]; big?: boolean }) {
  return (
    <div className="flex items-start justify-center gap-3 flex-wrap">
      {segments.map((s, i) => (
        <div
          key={i}
          className="segment-part flex flex-col items-center"
          style={{ animationDelay: `${i * 0.25}s` }}
        >
          <span
            className={`rounded-2xl px-4 py-2 font-bold tracking-wide ${
              big ? "text-5xl" : "text-2xl"
            }`}
            style={{ background: MACARON[i % MACARON.length] }}
          >
            {s.part}
          </span>
          <span className="mt-2 text-sm text-black/60 max-w-32 text-center">{s.meaningCn}</span>
          <span className="text-xs text-black/30">
            {s.type === "prefix" ? "前缀" : s.type === "root" ? "词根" : s.type === "suffix" ? "后缀" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
