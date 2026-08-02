"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";
import BookShelf from "@/components/BookShelf";

interface BookInfo {
  id: string;
  name: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
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

// 轮盘里"系统自动安排"的固定选项 id
const AUTO = "auto";

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
  const [selectedBook, setSelectedBook] = useState<string>(AUTO);
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
  const plans = session?.plans ?? [];
  const readyBooks = books.filter((b) => b.status === "ready");

  // 系统安排与所有单词书同时展示，点击卡片即可切换。
  let selectedDesc: string;
  if (selectedBook === AUTO) {
    selectedDesc =
      plans.length > 0
        ? plans
            .map((p) => `${p.bookName} ${p.quota === 0 ? "已完成" : `今日 ${p.doneToday}/${p.quota}`}`)
            .join(" · ")
        : `按每日新词目标自动安排（${session?.stats.dailyNewTarget ?? 0} 词）`;
  } else {
    const plan = plans.find((p) => p.bookId === selectedBook);
    selectedDesc = plan
      ? `${planDesc(plan)} · ${plan.quota === 0 ? "已完成" : `今日 ${plan.doneToday}/${plan.quota}`}${plan.remaining === 0 && plan.quota > 0 ? " · 今日完成" : ""}`
      : "本书暂无每日计划，将按每日新词目标安排";
  }

  const learnHref = selectedBook === AUTO ? "/learn" : `/learn?book=${selectedBook}`;
  const selectedName = selectedBook === AUTO ? "智能安排" : readyBooks.find((b) => b.id === selectedBook)?.name;
  const totalWords = readyBooks.reduce((sum, book) => sum + book.total, 0);
  const learnedWords = readyBooks.reduce((sum, book) => sum + book.learned, 0);
  const shelfItems = [
    {
      id: AUTO,
      name: "智能安排",
      total: totalWords,
      learned: learnedWords,
      mastered: readyBooks.reduce((sum, book) => sum + book.mastered, 0),
      eyebrow: "推荐",
      description: selectedDesc,
    },
    ...readyBooks.map((book) => ({
      id: book.id,
      name: book.name,
      total: book.total,
      learned: book.learned,
      mastered: book.mastered,
      description: plans.find((plan) => plan.bookId === book.id)
        ? planDesc(plans.find((plan) => plan.bookId === book.id)!)
        : `已学习 ${book.learned}，已掌握 ${book.mastered}`,
    })),
  ];

  return (
    <div className="page-shell flex flex-col gap-8">
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      <section className="relative overflow-hidden rounded-[2rem] bg-foreground px-6 py-8 text-white shadow-[0_24px_60px_rgba(58,46,92,0.2)] sm:px-8 lg:px-10 lg:py-10">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-accent/35 blur-3xl" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-3 text-sm font-bold tracking-[0.18em] text-white/55 uppercase">Up next · 今日下一步</div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              {due > 0 ? `先完成 ${due} 个到期复习` : "开始今天的新词学习"}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/68 lg:text-lg">
              {due > 0
                ? "到期词先用主动回忆巩固；完成后，系统会自动带你进入新词学习。"
                : `已选择「${selectedName ?? "智能安排"}」；今天会按计划安排 ${session?.stats.dailyNewTarget ?? 0} 个新词。`}
            </p>
            <div className="mt-6 flex flex-wrap gap-6 text-sm text-white/65">
              <span><strong className="text-xl text-white">{session?.stats.reviewsDoneToday ?? 0}</strong> 今日复习</span>
              <span><strong className="text-xl text-white">{session?.stats.learnedToday ?? 0}</strong> 今日新词</span>
              <span><strong className="text-xl text-white">{learnedWords}</strong> 累计学习</span>
            </div>
          </div>
          <Link
            href={due > 0 ? "/check?mode=review" : learnHref}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl bg-white px-8 py-4 text-lg font-black text-foreground shadow-lg transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/35"
          >
            {due > 0 ? "开始今日复习" : "开始背单词"}
            <span className="ml-3" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/6 bg-white/72 p-5 shadow-[0_16px_45px_rgba(58,46,92,0.08)] backdrop-blur sm:p-7 lg:p-8">
        <div className="mb-6 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-black">选择单词书</h2>
            <p className="mt-2 text-sm leading-6 text-black/48">
              所有可用单词书都在这里。点击选中；鼠标经过可以快速查看每本书的学习进度。
            </p>
          </div>
          <button
            onClick={() => setShowPlanSettings(true)}
            title="每日任务设置"
            className="shrink-0 rounded-xl border border-black/10 px-4 py-2 text-sm font-bold text-black/55 transition hover:border-accent/40 hover:bg-accent/8 hover:text-foreground"
          >
            调整每日计划
          </button>
        </div>
        {readyBooks.length === 0 ? (
          <div className="py-10 text-center text-black/40">
            还没有可用的单词书，<Link href="/import" className="text-blue-500 underline">去导入一本</Link>吧
          </div>
        ) : (
          <BookShelf items={shelfItems} value={selectedBook} onChange={setSelectedBook} />
        )}
      </section>

      <div className="flex items-center justify-between gap-4 border-t border-black/8 px-1 pt-5 text-sm text-black/45">
        <span>想额外加练？自由练习不会改变今日主任务。</span>
        <Link href="/check" className="shrink-0 font-bold text-foreground underline decoration-black/20 underline-offset-4 hover:text-accent">
          进入自由练习
        </Link>
      </div>

      {/* 每日任务设置（齿轮弹窗） */}
      {showPlanSettings && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowPlanSettings(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">每日任务设置</h2>
              <button
                onClick={() => setShowPlanSettings(false)}
                className="text-black/40 hover:text-black/70 text-xl leading-none"
              >
                ✕
              </button>
            </div>
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
        </div>
      )}
    </div>
  );
}
