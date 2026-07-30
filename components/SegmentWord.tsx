"use client";

import { MACARON, Segment } from "@/lib/client";

export type SegmentSize = "big" | "bigger" | "biggest";

const SIZE_CLASSES: Record<SegmentSize, { part: string; label: string; type: string }> = {
  big: { part: "text-5xl", label: "text-sm", type: "text-xs" },
  bigger: { part: "text-6xl", label: "text-base", type: "text-sm" },
  biggest: { part: "text-7xl", label: "text-lg", type: "text-base" },
};

// 词根词缀拆开动画：先呈现完整单词（各段紧贴、无底色），随后各段缓缓分开，
// 马卡龙底色淡入以区分词根词缀，最后浮现每段的中文释义
export default function SegmentWord({ segments, size = "big" }: { segments: Segment[]; size?: SegmentSize }) {
  const sz = SIZE_CLASSES[size];
  return (
    <div className="segment-split flex items-start justify-center flex-wrap">
      {segments.map((s, i) => (
        <div key={i} className="flex flex-col items-center">
          <span
            className={`segment-split-part rounded-2xl py-2 font-bold tracking-wide ${sz.part}`}
            style={
              {
                background: MACARON[i % MACARON.length],
                "--seg-bg": MACARON[i % MACARON.length],
                // 各段错峰拆开（fill backwards 保证延迟期间仍贴合为完整单词）
                animationDelay: `${i * 0.15}s`,
              } as React.CSSProperties
            }
          >
            {s.part}
          </span>
          <span
            className={`segment-split-label mt-2 ${sz.label} text-black/60 max-w-32 text-center`}
            style={{ animationDelay: `${1 + i * 0.15}s` }}
          >
            {s.meaningCn}
          </span>
          <span className={`segment-split-label ${sz.type} text-black/30`} style={{ animationDelay: `${1 + i * 0.15}s` }}>
            {s.type === "prefix" ? "前缀" : s.type === "root" ? "词根" : s.type === "suffix" ? "后缀" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
