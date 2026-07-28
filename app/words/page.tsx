"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface BookInfo {
  id: string;
  name: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
  units: number;
  analyzeDone: number;
  analyzeTotal: number;
  audioDone: number;
  audioTotal: number;
}

const COVERS = ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#C7CEEA", "#FFD6E0"];

function progressOf(b: BookInfo): { label: string; pct: number } {
  if (b.audioTotal > 0) {
    return { label: `生成音频 ${b.audioDone}/${b.audioTotal}`, pct: (b.audioDone / b.audioTotal) * 100 };
  }
  if (b.analyzeTotal > 0) {
    return { label: `AI 解析中 ${b.analyzeDone}/${b.analyzeTotal} 单元`, pct: (b.analyzeDone / b.analyzeTotal) * 100 };
  }
  return { label: "准备中…", pct: 5 };
}

export default function WordsIndex() {
  const [books, setBooks] = useState<BookInfo[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async () => {
      const r = await fetch("/api/books");
      if (r.status === 401) return router.push("/login");
      const d = await r.json();
      setBooks(d.books);
      const hasProcessing = (d.books as BookInfo[]).some((b) => b.status === "processing");
      if (hasProcessing && !timer) {
        timer = setInterval(load, 3000);
      } else if (!hasProcessing && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    load();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [router]);

  if (!books) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="font-bold text-2xl mb-6">单词书</h1>
      {books.length === 0 ? (
        <div className="bg-white rounded-2xl shadow p-10 text-center text-black/40">
          还没有单词书，<Link href="/import" className="text-blue-500 underline">去导入</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {books.map((b, i) => {
            if (b.status === "processing") {
              const p = progressOf(b);
              return (
                <div key={b.id} className="rounded-2xl p-5 shadow bg-white border border-black/5">
                  <div className="font-bold text-lg leading-snug">{b.name}</div>
                  <div className="text-sm text-black/50 mt-1">导入中…</div>
                  <div className="text-sm text-black/60 mt-3">{p.label}</div>
                  <div className="h-2 rounded-full bg-black/5 overflow-hidden mt-2">
                    <div
                      className="h-full bg-blue-400 rounded-full transition-all"
                      style={{ width: `${Math.max(p.pct, 3)}%` }}
                    />
                  </div>
                </div>
              );
            }
            if (b.status === "error") {
              return (
                <div key={b.id} className="rounded-2xl p-5 shadow bg-white border border-red-200">
                  <div className="font-bold text-lg leading-snug">{b.name}</div>
                  <div className="text-sm text-red-500 mt-1">导入失败，请重新导入</div>
                </div>
              );
            }
            return (
              <Link
                key={b.id}
                href={`/words/${b.id}`}
                className="rounded-2xl p-5 shadow hover:shadow-md transition-shadow"
                style={{ background: COVERS[i % COVERS.length] }}
              >
                <div className="font-bold text-lg leading-snug">{b.name}</div>
                <div className="text-sm text-black/50 mt-1">{b.units} 个单元 · {b.total} 词</div>
                <div className="text-xs text-black/50 mt-3">已学 {b.learned} · 掌握 {b.mastered}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
