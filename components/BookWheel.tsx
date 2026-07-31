"use client";

import { useEffect, useRef } from "react";

export interface WheelItem {
  id: string;
  label: string;
}

const ITEM_H = 44; // 每项高度（px）
const VISIBLE = 5; // 可见项数（奇数，中间一项为选中项）

// 垂直滚轮选择器：上下滚动选定一项，点击某项也可滚动到位
export default function BookWheel({
  items,
  value,
  onChange,
}: {
  items: WheelItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pad = ITEM_H * Math.floor(VISIBLE / 2);
  const selectedIndex = Math.max(0, items.findIndex((i) => i.id === value));

  // 初始定位到选中项
  useEffect(() => {
    listRef.current?.scrollTo({ top: selectedIndex * ITEM_H });
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / ITEM_H);
    const item = items[i];
    if (item && item.id !== value) onChange(item.id);
  };

  return (
    <div className="relative" style={{ height: ITEM_H * VISIBLE }}>
      {/* 上下渐隐，营造轮盘感 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-white to-transparent" style={{ height: ITEM_H * 2 }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-white to-transparent" style={{ height: ITEM_H * 2 }} />
      {/* 选中高亮带 */}
      <div
        className="pointer-events-none absolute inset-x-2 border-y-2 border-accent/50 bg-accent/10 rounded-lg"
        style={{ top: pad, height: ITEM_H }}
      />
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ height: pad }} />
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => listRef.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
            className={`w-full snap-center flex items-center justify-center px-4 transition-all ${
              i === selectedIndex ? "font-bold text-lg" : "text-black/40"
            }`}
            style={{ height: ITEM_H }}
          >
            <span className="truncate">{item.label}</span>
          </button>
        ))}
        <div style={{ height: pad }} />
      </div>
    </div>
  );
}
