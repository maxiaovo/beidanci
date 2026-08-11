"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Books, Plus } from "@phosphor-icons/react";

export interface ShelfBook {
  id: string;
  name: string;
  total: number;
  learned: number;
  hasCover: boolean;
  auto?: boolean; // “智能安排”聚合卡片
  subtitle?: string; // 计划描述，如「每天 10 词 · 今日 3/10」
}

// 文字封皮：未上传封皮图时按书名生成配色稳定的文字封面
function TextCover({ name, seed }: { name: string; seed: string }) {
  const PALETTES = [
    "from-indigo-200 to-violet-300",
    "from-sky-200 to-cyan-300",
    "from-amber-200 to-orange-300",
    "from-emerald-200 to-teal-300",
    "from-rose-200 to-pink-300",
    "from-fuchsia-200 to-purple-300",
  ];
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = PALETTES[hash % PALETTES.length];
  return (
    <span
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br p-1.5 text-center ${palette}`}
      aria-hidden="true"
    >
      <span className="line-clamp-3 text-[11px] font-black leading-tight text-black/55">{name}</span>
    </span>
  );
}

export function BookCoverThumb({
  id,
  name,
  hasCover,
  className = "h-20 w-14",
}: {
  id: string;
  name: string;
  hasCover: boolean;
  className?: string;
}) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-xl border border-black/8 bg-black/4 shadow-sm ${className}`}>
      {hasCover ? (
        <Image
          src={`/api/books/${id}/cover`}
          alt={`${name} 封皮`}
          width={56}
          height={80}
          unoptimized
          className="h-full w-full object-cover"
        />
      ) : (
        <TextCover name={name} seed={id} />
      )}
    </span>
  );
}

// 书架：只展示"在学"的单词书；点击卡片选为当前学习内容，
// 长按（鼠标或手指按住约 0.6 秒）弹出「移出」按钮（保留学习记录），
// 末尾虚线卡片打开"添加单词书"
const LONG_PRESS_MS = 600;

export default function BookShelf({
  books,
  value,
  onChange,
  onRemove,
  onAdd,
}: {
  books: ShelfBook[];
  value: string;
  onChange: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  // 正在展示「移出」按钮的书；长按触发，点其他地方取消
  const [removalId, setRemovalId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = (book: ShelfBook) => {
    if (book.auto) return;
    cancelPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setRemovalId(book.id);
    }, LONG_PRESS_MS);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {/* 「移出」待确认时，点击卡片以外的任意位置取消 */}
      {removalId && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40"
          onClick={() => setRemovalId(null)}
        />
      )}
      {books.map((book) => {
        const selected = book.id === value;
        const progress = book.total > 0 ? Math.min(100, Math.round((book.learned / book.total) * 100)) : 0;

        return (
          <div
            key={book.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            onClick={() => onChange(book.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(book.id);
              } else if ((e.key === "Delete" || e.key === "Backspace") && !book.auto) {
                e.preventDefault();
                setRemovalId(book.id);
              } else if (e.key === "Escape") {
                setRemovalId(null);
              }
            }}
            onPointerDown={() => startPress(book)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onPointerCancel={cancelPress}
            onContextMenu={(e) => {
              // 触屏长按会触发系统菜单，挡住以便弹出「移出」
              if (!book.auto) e.preventDefault();
            }}
            className={`relative flex min-h-28 cursor-pointer select-none items-center gap-4 rounded-3xl border p-4 text-left outline-none transition-[transform,box-shadow,border-color] duration-300 focus-visible:ring-4 focus-visible:ring-accent/30 ${
              selected
                ? "border-accent bg-white shadow-[0_18px_45px_rgba(83,70,156,0.18)]"
                : "border-black/8 bg-white/85 shadow-[0_10px_26px_rgba(58,46,92,0.07)] hover:border-accent/45"
            }`}
          >
            {book.auto ? (
              <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                <Books size={30} weight="duotone" />
              </span>
            ) : (
              <BookCoverThumb id={book.id} name={book.name} hasCover={book.hasCover} />
            )}

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-black leading-snug text-foreground">{book.name}</span>
                {selected && (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">当前</span>
                )}
              </span>
              {book.subtitle && <span className="mt-1 block truncate text-xs text-black/45">{book.subtitle}</span>}
              <span className="mt-2.5 block">
                <span className="mb-1 flex justify-between text-[11px] font-medium text-black/38">
                  <span>{book.total > 0 ? `进度 ${progress}%` : "等待开始"}</span>
                  {book.total > 0 && <span>{book.learned}/{book.total}</span>}
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-black/6">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              </span>
            </span>

            {!book.auto && removalId === book.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRemovalId(null);
                  onRemove(book.id);
                }}
                className="absolute right-2 top-2 z-50 rounded-full bg-red-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300"
              >
                移出
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        className="flex min-h-28 items-center justify-center gap-2.5 rounded-3xl border-2 border-dashed border-black/12 p-4 text-sm font-bold text-foreground/45 transition hover:border-accent/40 hover:text-accent"
      >
        <Plus size={20} weight="bold" />
        添加单词书
      </button>
    </div>
  );
}
