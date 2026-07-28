"use client";

import { playAudio } from "@/lib/client";

export default function AudioButton({ file, size = "sm" }: { file: string | null; size?: "sm" | "lg" }) {
  if (!file) return null;
  const cls = size === "lg" ? "text-2xl" : "text-base";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        playAudio(file);
      }}
      className={`${cls} opacity-60 hover:opacity-100 transition-opacity cursor-pointer`}
      title="播放读音"
    >
      🔊
    </button>
  );
}
