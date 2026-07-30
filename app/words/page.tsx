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
  mine: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      const d = await r.json();
      if (d.user?.role === "parent") return router.replace("/parent");
      if (d.user?.role === "admin") setIsAdmin(true);
    });
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = async () => {
      const r = await fetch("/api/books");
      if (r.status === 401) return router.push("/login");
      const d = await r.json();
      setBooks(d.books);
      const hasProcessing = (d.books as BookInfo[]).some(
        (b) => b.status === "processing" || b.status === "queued"
      );
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

  async function stopImport(b: BookInfo) {
    setBooks((prev) => prev?.map((x) => (x.id === b.id ? { ...x, status: "stopped" } : x)) ?? null);
    await fetch(`/api/books/${b.id}/stop`, { method: "POST" });
  }

  async function resumeImport(b: BookInfo) {
    setBooks((prev) => prev?.map((x) => (x.id === b.id ? { ...x, status: "queued" } : x)) ?? null);
    const r = await fetch(`/api/books/${b.id}/resume`, { method: "POST" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "续传失败，请重试");
      setBooks((prev) => prev?.map((x) => (x.id === b.id ? { ...x, status: b.status } : x)) ?? null);
    }
  }

  async function deleteBook(b: BookInfo) {
    if (!confirm(`确定删除「${b.name}」吗？书中的单词、学习记录和音频都会删除，不可恢复。`)) return;
    const res = await fetch(`/api/books/${b.id}`, { method: "DELETE" });
    if (res.ok) setBooks((prev) => prev?.filter((x) => x.id !== b.id) ?? null);
    else alert("删除失败，请重试");
  }

  const canManage = (b: BookInfo) => b.mine || isAdmin;

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
            if (b.status === "processing" || b.status === "queued") {
              const p = b.status === "queued" ? { label: "排队等待处理…", pct: 0 } : progressOf(b);
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
                  {canManage(b) && (
                    <button
                      onClick={() => stopImport(b)}
                      className="mt-3 text-sm text-red-500 border border-red-200 rounded-lg px-3 py-1 hover:bg-red-50"
                    >
                      停止导入
                    </button>
                  )}
                </div>
              );
            }
            if (b.status === "error" || b.status === "stopped") {
              return (
                <div key={b.id} className="rounded-2xl p-5 shadow bg-white border border-red-200">
                  <div className="font-bold text-lg leading-snug">{b.name}</div>
                  <div className="text-sm text-red-500 mt-1">
                    {b.status === "stopped" ? "已停止导入，已生成内容保留" : "导入中断，可从断点继续"}
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap items-center">
                    {b.total > 0 && (
                      <Link href={`/words/${b.id}`} className="text-sm text-blue-500 underline">
                        查看已有 {b.total} 词 →
                      </Link>
                    )}
                    {canManage(b) && (
                      <>
                        <button
                          onClick={() => resumeImport(b)}
                          className="text-sm text-white bg-blue-500 rounded-lg px-3 py-1 hover:bg-blue-600"
                        >
                          继续导入
                        </button>
                        <button
                          onClick={() => deleteBook(b)}
                          className="text-sm text-black/40 border border-black/10 rounded-lg px-3 py-1 hover:bg-black/5"
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div
                key={b.id}
                className="rounded-2xl p-5 shadow hover:shadow-md transition-shadow relative"
                style={{ background: COVERS[i % COVERS.length] }}
              >
                <Link href={`/words/${b.id}`} className="block pr-12">
                  <div className="font-bold text-lg leading-snug">{b.name}</div>
                  <div className="text-sm text-black/50 mt-1">{b.units} 个单元 · {b.total} 词</div>
                  <div className="text-xs text-black/50 mt-3">已学 {b.learned} · 掌握 {b.mastered}</div>
                </Link>
                {canManage(b) && (
                  <button
                    onClick={() => deleteBook(b)}
                    className="absolute top-3 right-3 text-xs text-black/40 border border-black/10 rounded-lg px-2 py-0.5 bg-white/60 hover:bg-white"
                  >
                    删除
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
