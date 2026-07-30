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

interface SessionPlan {
  bookId: string;
  bookName: string;
  amountType: string;
  wordsPerDay: number;
  fractionDen: number;
  quota: number;
  doneToday: number;
  remaining: number;
}

interface SessionStats {
  reviewsCleared: boolean;
  plans?: SessionPlan[];
  stats: {
    dueCount: number;
    reviewsDoneToday: number;
    learnedToday: number;
    dailyNewTarget: number;
    defaultCheckMode: string;
  };
}

interface PlanInfo {
  id: string;
  bookId: string;
  bookName: string;
  amountType: string;
  wordsPerDay: number;
  fractionDen: number;
  totalWords: number;
}

// 设置面板中每本书的编辑状态
interface PlanSetting {
  mode: "none" | "words" | "fraction";
  wordsPerDay: number;
  fractionDen: number;
}

const COVERS = ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#C7CEEA", "#FFD6E0"];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function planDesc(p: { amountType: string; wordsPerDay: number; fractionDen: number }) {
  return p.amountType === "words" ? `每天 ${p.wordsPerDay} 词` : `每天单元的 1/${p.fractionDen}`;
}

function settingsFromPlans(plans: PlanInfo[]): Record<string, PlanSetting> {
  const map: Record<string, PlanSetting> = {};
  for (const p of plans) {
    map[p.bookId] = {
      mode: p.amountType === "fraction" ? "fraction" : "words",
      wordsPerDay: p.wordsPerDay,
      fractionDen: p.fractionDen,
    };
  }
  return map;
}

export default function Dashboard() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [session, setSession] = useState<SessionStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msgQueue, setMsgQueue] = useState<ParentMessage[]>([]);
  const [planSettings, setPlanSettings] = useState<Record<string, PlanSetting>>({});
  const [showPlanSettings, setShowPlanSettings] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);
  const [plansSaved, setPlansSaved] = useState(false);
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
      fetch("/api/plans").then((r) => (r.status === 401 ? null : r.json())),
    ]).then(([b, s, p]) => {
      if (!b || !s) {
        router.push("/login");
        return;
      }
      setBooks(b.books);
      setSession(s);
      if (p?.plans) setPlanSettings(settingsFromPlans(p.plans));
      setLoaded(true);
    });
    // 登录后落地页：展示"开始时"触发的家长留言
    fetch("/api/messages").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setMsgQueue((d.messages as ParentMessage[]).filter((m) => m.trigger === "start"));
    });
  }, [router]);

  const savePlans = async () => {
    setSavingPlans(true);
    const plans = Object.entries(planSettings)
      .filter(([, s]) => s.mode !== "none")
      .map(([bookId, s]) => ({
        bookId,
        amountType: s.mode,
        wordsPerDay: s.wordsPerDay,
        fractionDen: s.fractionDen,
      }));
    const r = await fetch("/api/plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plans }),
    });
    if (r.ok) {
      const [s, p] = await Promise.all([
        fetch("/api/session").then((res) => res.json()),
        fetch("/api/plans").then((res) => res.json()),
      ]);
      setSession(s);
      setPlanSettings(settingsFromPlans(p.plans ?? []));
      setPlansSaved(true);
      setTimeout(() => setPlansSaved(false), 3000);
    }
    setSavingPlans(false);
  };

  if (!loaded) {
    return <div className="p-10 text-center text-black/40">加载中…</div>;
  }

  const due = session?.stats.dueCount ?? 0;
  const cleared = session?.reviewsCleared ?? true;
  const plans = session?.plans ?? [];
  const readyBooks = books.filter((b) => b.status === "ready");

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      {/* 今日任务 */}
      <section className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-bold text-lg mb-4">今日任务</h2>
        {plans.length === 0 ? (
          <>
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
          </>
        ) : (
          <>
            {due > 0 && (
              <div className="flex items-center gap-4 flex-wrap mb-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-500">{due}</div>
                  <div className="text-sm text-black/50 mt-1">待复习</div>
                </div>
                <Link
                  href="/check?mode=review"
                  className="bg-orange-500 text-white rounded-xl px-5 py-2.5 font-bold hover:opacity-90"
                >
                  先复习 {due} 词 →
                </Link>
                <p className="text-sm text-orange-500/80 w-full">
                  按记忆曲线，先通过全部复习检查才能解锁新词哦
                </p>
              </div>
            )}
            <div className="flex flex-col divide-y divide-black/5">
              {plans.map((p) => (
                <div key={p.bookId} className="flex items-center gap-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{p.bookName}</div>
                    <div className="text-sm text-black/50">{planDesc(p)}</div>
                  </div>
                  <div className={`text-sm font-medium ${p.quota === 0 ? "text-green-500" : "text-black/60"}`}>
                    {p.quota === 0 ? "已完成" : `今日 ${p.doneToday}/${p.quota}`}
                  </div>
                  {p.remaining === 0 ? (
                    <span className="bg-black/10 text-black/40 rounded-xl px-5 py-2.5 font-bold">
                      今日完成
                    </span>
                  ) : (
                    <Link
                      href={`/learn?book=${p.bookId}`}
                      className="bg-blue-500 text-white rounded-xl px-5 py-2.5 font-bold hover:opacity-90"
                    >
                      学习 →
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-right">
              <Link href="/check" className="text-sm text-black/50 hover:underline">
                自由检查 →
              </Link>
            </div>
          </>
        )}
      </section>

      {/* 每日任务设置 */}
      <section className="bg-white rounded-2xl shadow p-6">
        <button
          onClick={() => setShowPlanSettings((v) => !v)}
          className="flex items-center justify-between w-full"
        >
          <h2 className="font-bold text-lg">每日任务设置</h2>
          <span className="text-sm text-black/40">{showPlanSettings ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        {showPlanSettings && (
          <div className="mt-4">
            {readyBooks.length === 0 ? (
              <div className="text-black/40 text-sm">还没有可用的单词书</div>
            ) : (
              <div className="flex flex-col divide-y divide-black/5">
                {readyBooks.map((b) => {
                  const s = planSettings[b.id] ?? { mode: "none", wordsPerDay: 20, fractionDen: 2 };
                  const update = (patch: Partial<PlanSetting>) =>
                    setPlanSettings((prev) => ({ ...prev, [b.id]: { ...s, ...patch } }));
                  return (
                    <div key={b.id} className="flex items-center gap-3 py-3 flex-wrap">
                      <div className="flex-1 min-w-0 font-medium truncate">{b.name}</div>
                      <select
                        value={s.mode}
                        onChange={(e) => update({ mode: e.target.value as PlanSetting["mode"] })}
                        className="border border-black/15 rounded-lg px-2 py-1.5 text-sm bg-white"
                      >
                        <option value="none">不安排</option>
                        <option value="words">每天 N 词</option>
                        <option value="fraction">每天单元的 1/N</option>
                      </select>
                      {s.mode !== "none" && (
                        <input
                          type="number"
                          min={s.mode === "words" ? 1 : 2}
                          max={s.mode === "words" ? 200 : 10}
                          value={s.mode === "words" ? s.wordsPerDay : s.fractionDen}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isNaN(n)) return;
                            if (s.mode === "words") update({ wordsPerDay: clamp(n, 1, 200) });
                            else update({ fractionDen: clamp(n, 2, 10) });
                          }}
                          className="border border-black/15 rounded-lg px-2 py-1.5 text-sm w-20"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={savePlans}
                disabled={savingPlans}
                className="bg-blue-500 text-white rounded-xl px-6 py-2.5 font-bold hover:opacity-90 disabled:opacity-50"
              >
                {savingPlans ? "保存中…" : "保存"}
              </button>
              {plansSaved && <span className="text-sm text-green-500">已保存</span>}
            </div>
          </div>
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
