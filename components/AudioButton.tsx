"use client";

import { useEffect, useRef, useState } from "react";
import { playAudio } from "@/lib/client";

export default function AudioButton({ file, size = "sm" }: { file: string | null; size?: "sm" | "lg" }) {
  // 播放失败时的就地提示（小气泡），几秒后自动消失
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  if (!file) return null;
  const cls = size === "lg" ? "text-2xl" : "text-base";
  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void playAudio(file).then((ok) => {
            if (ok) return;
            setFailed(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setFailed(false), 3000);
          });
        }}
        className={`${cls} opacity-60 hover:opacity-100 transition-opacity cursor-pointer`}
        title="播放读音"
      >
        {failed ? "🔇" : "🔊"}
      </button>
      {failed && (
        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/80 px-2 py-1 text-xs text-white">
          音频加载失败
        </span>
      )}
    </span>
  );
}
