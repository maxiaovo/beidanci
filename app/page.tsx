"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";

interface BookInfo {
  id: string;
  name: string;
  status: string;
  audioDone: number;
  audioTotal: number;
  total: number;
  learned: number;
  mastered: number;
  units: number;
}

interface SessionStats {
  reviewsCleared: boolean;
  stats: {
    dueCount: number;
    reviewsDoneToday: number;
    learnedToday: number;
    dailyNewTarget: number;
    defaultCheckMode: string;
  };
}

const COVERS = ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#C7CEEA", "#FFD6E0"];

export default function Dashboard() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [session, setSession] = useState<SessionStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msgQueue, setMsgQueue] = useState<ParentMessage[]>([]);
  const router = useRouter();

  useEffect(() => {
    // 家长不参与学习，落地即转到家长页
    fetch("/api/auth/me").then(async (r) => {
      const d = await r.json();
      if (d.user?.role === "parent") router.replace("/parent");
    });
    Promise.all([
      fetch("/api/books").then((r) => (r.status === 401 ? null : r.json())),
      fetch("/api/session").then((r) => (r.status === 401 ? null : r.json())),
    ]).then(([b, s]) => {
      if (!b || !s) {
        router.push("/login");
        return;
      }
      setBooks(b.books);
      setSession(s);
      setLoaded(true);
    });
    // 登录后落地页：展示"开始时"触发的家长留言
    fetch("/api/messages").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setMsgQueue((d.messages as ParentMessage[]).filter((m) => m.trigger === "start"));
    });
  }, [router]);

  if (!loaded) {
    return <div className="p-10 text-center text-black/40">加载中…</div>;
  }

  const due = session?.stats.dueCount ?? 0;
  const cleared = session?.reviewsCleared ?? true;

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      {/* 今日任务 */}
      <section className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-bold text-lg mb-4">今日任务</h2>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="text-center">
            <div className={`text-4xl font-bold ${due > 0 ? "text-orange-500" : "text-green-500"}`}>{due}</div>
            <div className="text-sm text-black/50 mt-1">待复习</div>
          </div>
          <div className="text-2xl text-black/20">→</div>
          <div className="text-center">
            <div className={`text-4xl font-bold ${cleared ? "text-blue-500" : "text-black/20"}`}>
              {session?.stats.dailyNewTarget ?? 0}
            </div>
            <div className="text-sm text-black/50 mt-1">新词目标</div>
          </div>
          <div className="flex-1" />
          <div className="flex gap-3">
            {due > 0 ? (
              <Link
                href="/check?mode=review"
                className="bg-orange-500 text-white rounded-xl px-6 py-3 font-bold hover:opacity-90"
              >
                先复习 {due} 词 →
              </Link>
            ) : (
              <Link
                href="/learn"
                className="bg-blue-500 text-white rounded-xl px-6 py-3 font-bold hover:opacity-90"
              >
                开始背新词 →
              </Link>
            )}
            <Link
              href="/check"
              className="border border-black/15 rounded-xl px-6 py-3 font-medium hover:bg-black/5"
            >
              自由检查
            </Link>
          </div>
        </div>
        {due > 0 && (
          <p className="text-sm text-orange-500/80 mt-3">
            按记忆曲线，先通过全部复习检查才能解锁新词哦
          </p>
        )}
      </section>

      {/* 我的单词书 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">我的单词书</h2>
          <Link href="/import" className="text-sm text-blue-500 hover:underline">+ 导入单词书</Link>
        </div>
        {books.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-10 text-center text-black/40">
            还没有单词书，<Link href="/import" className="text-blue-500 underline">去导入一本</Link>吧
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {books.map((b, i) => (
              <Link
                key={b.id}
                href={`/words/${b.id}`}
                className="rounded-2xl p-5 shadow hover:shadow-md transition-shadow flex flex-col gap-2"
                style={{ background: COVERS[i % COVERS.length] }}
              >
                <div className="font-bold text-lg leading-snug">{b.name}</div>
                <div className="text-sm text-black/50">{b.units} 个单元 · {b.total} 词</div>
                {b.status === "processing" || b.status === "queued" ? (
                  <div className="text-sm text-black/60">
                    {b.status === "queued" ? "排队等待处理…" : `导入中… 音频 ${b.audioDone}/${b.audioTotal}`}
                  </div>
                ) : b.status === "error" ? (
                  <div className="text-sm text-red-600">导入出错</div>
                ) : b.status === "stopped" ? (
                  <div className="text-sm text-black/50">已停止导入（{b.total} 词可用）</div>
                ) : (
                  <div className="mt-auto">
                    <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                      <div
                        className="h-full bg-foreground/70 rounded-full"
                        style={{ width: b.total ? `${(b.learned / b.total) * 100}%` : "0%" }}
                      />
                    </div>
                    <div className="text-xs text-black/50 mt-1">
                      已学 {b.learned}/{b.total} · 掌握 {b.mastered}
                    </div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
