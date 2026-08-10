"use client";

import { useEffect, useState } from "react";

interface ActivityItem {
  userId: string;
  username: string;
  avatarUrl: string | null;
  action: string;
  detail: string;
  live: boolean;
  at: string;
}

function timeAgo(at: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.round(minutes / 60)} 小时前`;
}

function TickerChip({ item }: { item: ActivityItem }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 backdrop-blur">
      {item.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/avatars/${item.avatarUrl}`} alt="" className="h-4 w-4 rounded-full object-cover" />
      ) : (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {item.username.slice(0, 1).toUpperCase()}
        </span>
      )}
      {item.live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-label="正在学习" />}
      <b>{item.username}</b>
      <span className="text-white/75">
        {item.action} {item.detail}
        {!item.live && <span className="text-white/45"> · {timeAgo(item.at)}</span>}
      </span>
    </span>
  );
}

export default function ActivityTicker() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    let stopped = false;
    async function load() {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/activity/now");
        if (!r.ok) return;
        const data = await r.json();
        if (!stopped) setItems(data.items ?? []);
      } catch {
        /* 网络抖动时保留旧数据，下轮再试 */
      }
    }
    void load();
    const timer = setInterval(load, 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  const list = items ?? [];
  const liveCount = list.filter((item) => item.live).length;
  const duration = Math.max(20, list.length * 6);

  return (
    <div className="relative flex h-[34px] items-stretch overflow-hidden border-b border-white/10 bg-gradient-to-r from-[#1c1430] via-[#2a1b4a] to-[#1c1430] text-xs text-white">
      <div className="z-10 flex shrink-0 items-center gap-1.5 border-r border-white/10 bg-white/5 px-3 font-black tracking-widest">
        <span className="relative flex h-2 w-2">
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${liveCount > 0 ? "bg-emerald-400" : "bg-white/40"}`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${liveCount > 0 ? "bg-emerald-400" : "bg-white/40"}`} />
        </span>
        {liveCount > 0 ? "LIVE" : "今日"}
      </div>
      {items === null ? (
        <div className="flex items-center px-4 text-white/40">正在同步学习动态…</div>
      ) : list.length === 0 ? (
        <div className="flex items-center px-4 text-white/60">还没人开始学习，来当第一个 ✨</div>
      ) : (
        <div className="ticker-mask relative flex-1 overflow-hidden">
          <div className="ticker-track absolute inset-y-0 flex items-center whitespace-nowrap" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-6 pr-6">
                {list.map((item) => (
                  <span key={`${item.userId}-${copy}`} className="flex items-center gap-6">
                    <TickerChip item={item} />
                    <span aria-hidden="true" className="text-white/25">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
