"use client";

import { MACARON, Segment } from "@/lib/client";
import { clampPx } from "@/lib/appearance";

// 词根词缀拆开动画：先呈现完整单词（各段紧贴、无底色），随后各段缓缓分开，
// 马卡龙底色淡入以区分词根词缀，最后浮现每段的中文释义
export default function SegmentWord({ segments, sizePx = 48 }: { segments: Segment[]; sizePx?: number }) {
  // 释义 / 类型标签随词段字号按比例缩放（下限 10px）
  const labelPx = Math.max(10, Math.round(sizePx * 0.3));
  const typePx = Math.max(10, Math.round(sizePx * 0.25));
  return (
    <div className="segment-split flex items-start justify-center flex-wrap">
      {segments.map((s, i) => (
        <div key={i} className="flex flex-col items-center">
          <span
            className="segment-split-part rounded-2xl py-2 font-bold tracking-wide"
            style={
              {
                fontSize: clampPx(sizePx),
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
            className="segment-split-label mt-2 text-black/60 max-w-32 text-center"
            style={{ fontSize: `${labelPx}px`, animationDelay: `${1 + i * 0.15}s` }}
          >
            {s.meaningCn}
          </span>
          <span
            className="segment-split-label text-black/30"
            style={{ fontSize: `${typePx}px`, animationDelay: `${1 + i * 0.15}s` }}
          >
            {s.type === "prefix" ? "前缀" : s.type === "root" ? "词根" : s.type === "suffix" ? "后缀" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
