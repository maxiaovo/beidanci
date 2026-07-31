"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";
import BookWheel from "@/components/BookWheel";

interface BookInfo {
  id: string;
  name: string;
  status: string;
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
  const [selectedBook, setSelectedBook] = useState<string>(AUTO); // 轮盘选中的书
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

  // 轮盘选项：系统自动安排 + 所有可用单词书
  const wheelItems = [
    { id: AUTO, label: "🔄 系统自动安排" },
    ...readyBooks.map((b) => ({ id: b.id, label: b.name })),
  ];

  // 选中项的说明文字
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

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col gap-8">
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      {/* 今日任务 */}
      <section className="bg-white rounded-2xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">今日任务</h2>
          <button
            onClick={() => setShowPlanSettings(true)}
            title="每日任务设置"
            className="text-xl text-black/40 hover:text-black/70 hover:rotate-45 transition-transform"
          >
            ⚙️
          </button>
        </div>

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

        {readyBooks.length === 0 ? (
          <div className="text-center text-black/40 py-6">
            还没有可用的单词书，<Link href="/import" className="text-blue-500 underline">去导入一本</Link>吧
          </div>
        ) : (
          <>
            <BookWheel items={wheelItems} value={selectedBook} onChange={setSelectedBook} />
            <div className="text-center text-sm text-black/50 mt-2 min-h-5">{selectedDesc}</div>
            <div className="flex justify-center gap-3 mt-4">
              <Link
                href={learnHref}
                className="bg-blue-500 text-white rounded-xl px-8 py-3 font-bold hover:opacity-90"
              >
                开始背单词 →
              </Link>
              <Link
                href="/check"
                className="border border-black/15 rounded-xl px-6 py-3 font-medium hover:bg-black/5"
              >
                自由检查
              </Link>
            </div>
          </>
        )}
      </section>

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
