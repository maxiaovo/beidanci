"use client";

export interface BookShelfItem {
  id: string;
  name: string;
  total: number;
  learned: number;
  mastered: number;
  description?: string;
  eyebrow?: string;
}

export default function BookShelf({
  items,
  value,
  onChange,
}: {
  items: BookShelfItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => {
        const selected = item.id === value;
        const progress = item.total > 0 ? Math.min(100, Math.round((item.learned / item.total) * 100)) : 0;

        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(item.id)}
            className={`book-shelf-card group relative min-h-44 overflow-hidden rounded-3xl border p-5 text-left outline-none transition-[transform,box-shadow,border-color] duration-300 focus-visible:ring-4 focus-visible:ring-accent/30 ${
              selected
                ? "border-accent bg-white shadow-[0_18px_45px_rgba(83,70,156,0.18)]"
                : "border-black/8 bg-white/85 shadow-[0_10px_26px_rgba(58,46,92,0.07)] hover:border-accent/45"
            }`}
          >
            <span className="book-shelf-shine pointer-events-none absolute inset-0 opacity-0" aria-hidden="true" />
            <span className="relative flex h-full flex-col">
              <span className="mb-5 flex items-center justify-between gap-3">
                <span className="text-xs font-bold tracking-[0.16em] text-black/38 uppercase">
                  {item.eyebrow ?? "单词书"}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                    selected ? "bg-accent text-white" : "bg-black/5 text-black/45"
                  }`}
                >
                  {selected ? "已选择" : `${item.total} 词`}
                </span>
              </span>

              <span className="text-xl font-black leading-snug text-foreground">{item.name}</span>
              <span className="mt-2 min-h-10 text-sm leading-5 text-black/48">
                {item.description ?? `已学习 ${item.learned}，已掌握 ${item.mastered}`}
              </span>

              <span className="mt-auto pt-5">
                <span className="mb-2 flex justify-between text-xs font-medium text-black/38">
                  <span>{item.total > 0 ? `学习进度 ${progress}%` : "等待开始"}</span>
                  {item.total > 0 && <span>{item.learned}/{item.total}</span>}
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-black/6">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
