"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  Books,
  ChatText,
  Copy,
  GearSix,
  ListBullets,
  MapTrifold,
  PencilLine,
  Plus,
  Sparkle,
  SpeakerHigh,
  Translate,
  X,
} from "@phosphor-icons/react";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";
import BookShelf, { BookCoverThumb } from "@/components/BookShelf";
import type { DailyWordResource } from "@/components/DailyWordManager";

interface BookInfo {
  id: string;
  name: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
  enrolled: boolean;
  hasCover: boolean;
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

interface WritingOverview {
  profile: { assessmentStatus: string; abilitySummary: string } | null;
  review: { required: boolean; todayCount: number };
  activeSession: { id: string; title: string } | null;
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

type LearningModule = "words" | "writing";

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
  const [plansError, setPlansError] = useState("");
  const [selectedBook, setSelectedBook] = useState<string>(AUTO);
  const [writing, setWriting] = useState<WritingOverview | null>(null);
  const [learningModule, setLearningModule] = useState<LearningModule>("words");
  const [dailyWord, setDailyWord] = useState<DailyWordResource | null>(null);
  const [showAddBooks, setShowAddBooks] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 家长不参与学习：先判定角色再拉学习数据，避免家长角色下 403 导致白屏
      const r = await fetch("/api/auth/me");
      const d = await r.json();
      if (cancelled) return;
      if (d.user?.role === "parent") {
        router.replace("/parent");
        return;
      }
      const localDate = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const [b, s, p, w, daily] = await Promise.all([
        fetch("/api/books").then((res) => (res.status === 401 ? null : res.json())),
        fetch("/api/session").then((res) => (res.status === 401 ? null : res.json())),
        fetch("/api/plans").then((res) => (res.status === 401 ? null : res.json())),
        fetch("/api/writing/overview").then((res) => (res.ok ? res.json() : null)),
        fetch(`/api/daily-words?date=${localDate}`).then((res) => (res.ok ? res.json() : null)),
      ]);
      if (cancelled) return;
      if (!b || !s) {
        router.push("/login");
        return;
      }
      setBooks(b.books ?? []);
      setSession(s);
      if (p?.plans) setPlanSettings(settingsFromPlans(p.plans));
      if (w) setWriting(w);
      if (daily?.today) setDailyWord(daily.today);
      if (new URLSearchParams(window.location.search).get("plan") === "1") {
        setShowPlanSettings(true);
      }
      setLoaded(true);
      // 登录后落地页：展示"开始时"触发的家长留言
      const mr = await fetch("/api/messages");
      if (cancelled || !mr.ok) return;
      const md = await mr.json();
      setMsgQueue((md.messages as ParentMessage[]).filter((m) => m.trigger === "start"));
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const savePlans = async () => {
    setSavingPlans(true);
    setPlansError("");
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
    } else {
      const d = await r.json().catch(() => ({}));
      setPlansError(d.error || "保存失败，请重试");
    }
    setSavingPlans(false);
  };

  // 加入学习：刷新书单与今日安排
  const addBook = async (bookId: string) => {
    setEnrollingId(bookId);
    const r = await fetch(`/api/books/${bookId}/enroll`, { method: "POST" });
    if (r.ok) {
      const [b, s] = await Promise.all([
        fetch("/api/books").then((res) => res.json()),
        fetch("/api/session").then((res) => res.json()),
      ]);
      setBooks(b.books ?? []);
      setSession(s);
    }
    setEnrollingId(null);
  };

  // 移出学习：不删学习记录，重新加入后进度还在；长按书架卡片才会出现「移出」，且需两次确认
  const removeBook = async (bookId: string) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;
    if (!window.confirm(`⚠️ 确定要移出「${book.name}」吗？\n\n移出后不再安排这本书的新词和每日计划；你已学单词的复习记录会保留，以后重新加入时进度还在。`)) return;
    if (!window.confirm(`⚠️ 最后确认\n\n「${book.name}」将从你的书架移出，今日计划中属于这本书的部分也会取消。\n\n真的不再学这本书了吗？`)) return;
    const r = await fetch(`/api/books/${bookId}/enroll`, { method: "DELETE" });
    if (r.ok) {
      if (selectedBook === bookId) setSelectedBook(AUTO);
      const [b, s, p] = await Promise.all([
        fetch("/api/books").then((res) => res.json()),
        fetch("/api/session").then((res) => res.json()),
        fetch("/api/plans").then((res) => res.json()),
      ]);
      setBooks(b.books ?? []);
      setSession(s);
      setPlanSettings(settingsFromPlans(p.plans ?? []));
    }
  };

  if (!loaded) {
    return <div className="p-10 text-center text-black/40">加载中…</div>;
  }

  const due = session?.stats.dueCount ?? 0;
  const plans = session?.plans ?? [];
  const readyBooks = books.filter((b) => b.status === "ready");
  const enrolledBooks = readyBooks.filter((b) => b.enrolled);
  const addableBooks = readyBooks.filter((b) => !b.enrolled);

  // 选中项失效（书被移出）时回落到智能安排
  const effectiveSelected =
    selectedBook !== AUTO && enrolledBooks.some((b) => b.id === selectedBook) ? selectedBook : AUTO;

  // 系统安排与在学单词书同时展示，点击卡片即可切换。
  let selectedDesc: string;
  if (effectiveSelected === AUTO) {
    selectedDesc =
      plans.length > 0
        ? plans
            .map((p) => `${p.bookName} ${p.quota === 0 ? "已完成" : `今日 ${p.doneToday}/${p.quota}`}`)
            .join(" · ")
        : `按每日新词目标自动安排（${session?.stats.dailyNewTarget ?? 0} 词）`;
  } else {
    const plan = plans.find((p) => p.bookId === effectiveSelected);
    selectedDesc = plan
      ? `${planDesc(plan)} · ${plan.quota === 0 ? "已完成" : `今日 ${plan.doneToday}/${plan.quota}`}${plan.remaining === 0 && plan.quota > 0 ? " · 今日完成" : ""}`
      : "本书暂无每日计划，将按每日新词目标安排";
  }

  const learnHref = effectiveSelected === AUTO ? "/learn" : `/learn?book=${effectiveSelected}`;
  const selectedName = effectiveSelected === AUTO ? "智能安排" : enrolledBooks.find((b) => b.id === effectiveSelected)?.name;
  const totalWords = enrolledBooks.reduce((sum, book) => sum + book.total, 0);
  const learnedWords = enrolledBooks.reduce((sum, book) => sum + book.learned, 0);
  const shelfBooks = [
    {
      id: AUTO,
      auto: true,
      name: "智能安排",
      total: totalWords,
      learned: learnedWords,
      hasCover: false,
      subtitle: "按你的每日计划自动安排",
    },
    ...enrolledBooks.map((book) => {
      const plan = plans.find((p) => p.bookId === book.id);
      return {
        id: book.id,
        name: book.name,
        total: book.total,
        learned: book.learned,
        hasCover: book.hasCover,
        subtitle: plan
          ? `${planDesc(plan)} · ${plan.quota === 0 ? "今日完成" : `今日 ${plan.doneToday}/${plan.quota}`}`
          : `已学习 ${book.learned}，已掌握 ${book.mastered}`,
      };
    }),
  ];

  const writingNeedsAssessment = !writing?.profile || writing.profile.assessmentStatus === "pending";
  const writingTitle = writingNeedsAssessment
    ? "先用几个单句，摸清你的表达水平"
    : writing.review.required
      ? `复练今天的 ${writing.review.todayCount} 个写作错点`
      : writing.activeSession
        ? `继续：${writing.activeSession.title}`
        : "把今天真正想说的话写出来";
  const writingDescription = writing?.profile?.abilitySummary
    || "系统会根据你的表达水平安排题目，并在每次批改后要求你亲手改写过关。";
  const writingAction = writingNeedsAssessment
    ? "开始写作摸底"
    : writing.review.required
      ? "开始复练"
      : writing.activeSession
        ? "继续写作"
        : "选择练习";

  const isWords = learningModule === "words";
  const todayTitle = isWords
    ? due > 0
      ? `先完成 ${due} 个到期复习`
      : "开始今天的新词学习"
    : writingTitle;
  const todayDescription = isWords
    ? due > 0
      ? "先用主动回忆巩固到期词；完成后，系统会自动带你进入今天的新词学习。"
      : `已选择「${selectedName ?? "智能安排"}」；今天会按计划安排 ${session?.stats.dailyNewTarget ?? 0} 个新词。`
    : writingDescription;
  const todayHref = isWords ? (due > 0 ? "/check?mode=review" : learnHref) : "/writing";
  const todayAction = isWords ? (due > 0 ? "开始今日复习" : "开始背单词") : writingAction;

  const playDailyWord = () => {
    if (!dailyWord?.audioFile) return;
    const audio = new Audio(`/api/audio/${encodeURIComponent(dailyWord.audioFile)}`);
    void audio.play();
  };

  return (
    <div className="page-shell flex flex-col gap-6 sm:gap-8">
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      <section aria-label="学习模块" className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-3 sm:gap-4" role="tablist" aria-label="选择学习内容">
          <button
            type="button"
            role="tab"
            aria-selected={isWords}
            onClick={() => setLearningModule("words")}
            className={`module-card module-card-words flex min-h-24 w-40 items-center gap-3 rounded-3xl border-2 px-5 text-left transition sm:min-h-28 sm:w-52 sm:px-7 ${isWords ? "is-active" : "is-inactive"}`}
          >
            <BookOpen size={30} weight={isWords ? "fill" : "duotone"} />
            <span>
              <strong className="block text-xl font-black sm:text-2xl">单词</strong>
              <span className="mt-1 block text-xs opacity-55">记忆与复习</span>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isWords}
            onClick={() => setLearningModule("writing")}
            className={`module-card module-card-writing flex min-h-24 w-40 items-center gap-3 rounded-3xl border-2 px-5 text-left transition sm:min-h-28 sm:w-52 sm:px-7 ${!isWords ? "is-active" : "is-inactive"}`}
          >
            <PencilLine size={30} weight={!isWords ? "fill" : "duotone"} />
            <span>
              <strong className="block text-xl font-black sm:text-2xl">写作</strong>
              <span className="mt-1 block text-xs opacity-55">表达与改写</span>
            </span>
          </button>
          <div className="module-card-future flex min-h-24 w-40 items-center gap-3 rounded-3xl border-2 border-dashed px-5 text-left text-foreground/42 sm:min-h-28 sm:w-52 sm:px-7">
            <Plus size={28} weight="bold" />
            <span>
              <strong className="block text-lg font-black sm:text-xl">更多学习</strong>
              <span className="mt-1 block text-xs">敬请期待</span>
            </span>
          </div>
        </div>
      </section>

      <section className="dashboard-hero relative overflow-hidden rounded-[2rem] px-6 py-7 sm:px-8 sm:py-9 lg:min-h-[27rem] lg:px-10">
        {dailyWord && (
          <Image
            src={`/api/daily-words/images/${encodeURIComponent(dailyWord.imageFile)}?v=${encodeURIComponent(dailyWord.updatedAt)}`}
            alt=""
            fill
            priority
            unoptimized
            aria-hidden="true"
            className="dashboard-hero-image pointer-events-none object-contain object-right"
            sizes="(min-width: 1024px) 92vw, 100vw"
          />
        )}
        <div className="relative z-10 mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="dashboard-hero-eyebrow text-xs font-bold tracking-[0.2em] uppercase">Up next</div>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">今日下一步</h1>
          </div>
          <button
            type="button"
            onClick={() => setShowPlanSettings(true)}
            aria-label="设置每日任务"
            title="设置每日任务"
            className="dashboard-hero-settings inline-flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 sm:px-4"
          >
            <GearSix size={21} weight="bold" />
            <span className="hidden sm:inline">设置每日任务</span>
          </button>
        </div>
        <div className="relative z-10 grid items-end gap-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div>
            <h2 className="max-w-4xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">{todayTitle}</h2>
            <p className="dashboard-hero-muted mt-4 max-w-3xl text-base leading-7 lg:max-w-2xl lg:text-lg">{todayDescription}</p>
            <div className="dashboard-hero-muted mt-6 flex flex-wrap gap-x-7 gap-y-3 text-sm">
              {isWords ? (
                <>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{session?.stats.reviewsDoneToday ?? 0}</strong>今日复习</span>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{session?.stats.learnedToday ?? 0}</strong>今日新词</span>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{learnedWords}</strong>累计学习</span>
                </>
              ) : (
                <>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{writing?.review.todayCount ?? 0}</strong>待复练错点</span>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{writing?.activeSession ? 1 : 0}</strong>进行中的练习</span>
                  <span><strong className="dashboard-hero-strong mr-1.5 text-xl">{writingNeedsAssessment ? "待完成" : "已完成"}</strong>系统评估</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-8 lg:min-h-52 lg:justify-end">
            {dailyWord && (
              <div className="dashboard-daily-word self-start lg:self-center">
                <div className="text-lg font-black tracking-wide">{dailyWord.word}</div>
                <div className="mt-1 flex items-center gap-2 text-sm opacity-72">
                  <span>{dailyWord.phonetic}</span>
                  <button
                    type="button"
                    onClick={playDailyWord}
                    disabled={!dailyWord.audioFile}
                    aria-label={`播放 ${dailyWord.word} 的发音`}
                    title={dailyWord.audioFile ? "播放发音" : "发音可在后台生成"}
                    className="rounded-full p-1 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <SpeakerHigh size={20} weight="duotone" />
                  </button>
                </div>
              </div>
            )}
            {isWords && (
              <div className="dashboard-hero-settings flex items-center gap-3.5 self-start rounded-2xl border px-4 py-3 lg:self-center">
                {effectiveSelected === AUTO ? (
                  <span className="flex h-14 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    <Books size={24} weight="duotone" />
                  </span>
                ) : (
                  <BookCoverThumb
                    id={effectiveSelected}
                    name={selectedName ?? ""}
                    hasCover={enrolledBooks.find((b) => b.id === effectiveSelected)?.hasCover ?? false}
                    className="h-14 w-11"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-[0.14em] uppercase opacity-55">当前学习</span>
                  <span className="mt-0.5 block truncate text-base font-black">{selectedName}</span>
                  <span className="mt-0.5 block max-w-56 truncate text-xs opacity-70">{selectedDesc}</span>
                </span>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              <Link
                href={todayHref}
                className="dashboard-action inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-7 py-4 text-lg font-black shadow-lg transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4"
              >
                {todayAction}
                <ArrowRight size={22} weight="bold" />
              </Link>
              {isWords && (
                <Link
                  href="/learning-guide"
                  className="dashboard-hero-settings inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4"
                >
                  <MapTrifold size={19} weight="duotone" />
                  先了解这套学习方法
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {isWords ? (
        <>
          <section id="shelf" className="theme-surface scroll-mt-20 rounded-[2rem] border p-5 shadow-[0_16px_45px_rgba(58,46,92,0.08)] backdrop-blur sm:p-7 lg:p-8">
            <div className="mb-6">
              <div className="theme-section-eyebrow flex items-center gap-2 text-sm font-bold"><Sparkle size={18} weight="fill" /> 学习内容</div>
              <h2 className="mt-2 text-2xl font-black">我的单词书</h2>
              <p className="mt-2 text-sm leading-6 text-black/48">点击卡片选择今天学哪本；想学的书用「添加单词书」加入，不学了长按卡片可移出（学习记录保留）。</p>
            </div>
            {enrolledBooks.length === 0 && addableBooks.length === 0 ? (
              <div className="py-10 text-center text-black/40">
                还没有可用的单词书，<Link href="/import" className="font-bold text-accent underline">去导入一本</Link>吧
              </div>
            ) : (
              <BookShelf
                books={shelfBooks}
                value={effectiveSelected}
                onChange={setSelectedBook}
                onRemove={removeBook}
                onAdd={() => setShowAddBooks(true)}
              />
            )}
          </section>
          <div className="flex flex-col items-start justify-between gap-3 border-t border-black/8 px-1 pt-5 text-sm text-black/45 sm:flex-row sm:items-center">
            <span>想额外加练？自由练习不会改变今日主任务。</span>
            <Link href="/check" className="shrink-0 font-bold text-foreground underline decoration-black/20 underline-offset-4 hover:text-accent">进入自由练习</Link>
          </div>
        </>
      ) : (
        <section className="theme-surface rounded-[2rem] border p-5 shadow-[0_16px_45px_rgba(58,46,92,0.08)] backdrop-blur sm:p-7 lg:p-8">
          <div className="mb-6">
            <div className="theme-section-eyebrow flex items-center gap-2 text-sm font-bold"><Sparkle size={18} weight="fill" /> 学习内容</div>
            <h2 className="mt-2 text-2xl font-black">选择一种写作练习</h2>
            <p className="mt-2 text-sm leading-6 text-black/48">所有练习都会进入同一套批改、改写和能力评估流程。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              { title: "我有题目", desc: "带着自己的题目或想写的内容开始。", icon: ListBullets },
              { title: "帮我出题", desc: "系统按你的水平生成不同方向的题目。", icon: Sparkle },
              { title: "自由写一句", desc: "把此刻真正想说的话直接写成英文。", icon: ChatText },
              { title: "从中文开始", desc: "先理清中文想法，再把它写成英文。", icon: Translate },
              { title: "示范仿写", desc: "记住地道句子，再换一个场景重写。", icon: Copy },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} href="/writing" className="group min-h-44 rounded-3xl border border-black/7 bg-white p-5 text-left shadow-[0_10px_28px_rgba(58,46,92,0.07)] transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_18px_36px_rgba(58,46,92,0.12)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/12 text-accent"><Icon size={24} weight="duotone" /></span>
                  <h3 className="mt-5 text-xl font-black">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-black/48">{item.desc}</p>
                  <span className="mt-4 flex items-center gap-1.5 text-sm font-bold text-accent opacity-0 transition group-hover:opacity-100">开始练习 <ArrowRight size={16} weight="bold" /></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 添加单词书弹窗：列出可见但未在学的书 */}
      {showAddBooks && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setShowAddBooks(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-books-title"
            className="max-h-[84vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-accent">发现单词书</div>
                <h2 id="add-books-title" className="mt-1 text-2xl font-black">添加单词书</h2>
                <p className="mt-2 text-sm leading-6 text-black/48">加入后会出现在首页书架，并参与新词安排；随时可以移出。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBooks(false)}
                aria-label="关闭添加单词书"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-black/45 transition hover:bg-black/10 hover:text-black/70"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
            {addableBooks.length === 0 ? (
              <div className="py-6 text-center text-sm text-black/40">
                没有更多可添加的单词书，<Link href="/import" className="font-bold text-accent underline">自己导入一本</Link>吧
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-black/5">
                {addableBooks.map((b) => (
                  <div key={b.id} className="flex items-center gap-4 py-3.5">
                    <BookCoverThumb id={b.id} name={b.name} hasCover={b.hasCover} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold">{b.name}</div>
                      <div className="mt-0.5 text-xs text-black/45">{b.total} 词</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => addBook(b.id)}
                      disabled={enrollingId === b.id}
                      className="shrink-0 rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-white transition hover:bg-accent disabled:opacity-50"
                    >
                      {enrollingId === b.id ? "加入中…" : "加入学习"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 每日任务设置（齿轮弹窗） */}
      {showPlanSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setShowPlanSettings(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-plan-title"
            className="max-h-[84vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-accent">学习安排</div>
                <h2 id="daily-plan-title" className="mt-1 text-2xl font-black">每日任务设置</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanSettings(false)}
                aria-label="关闭每日任务设置"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-black/45 transition hover:bg-black/10 hover:text-black/70"
              >
                <X size={20} weight="bold" />
              </button>
            </div>
            <p className="mb-5 text-sm leading-6 text-black/48">调整每本在学单词书每天的学习量。写作任务会根据系统评估与错点复练自动安排。</p>
            {enrolledBooks.length === 0 ? (
              <div className="text-black/40 text-sm">还没有在学的单词书，先在首页书架上添加</div>
            ) : (
              <div className="flex flex-col divide-y divide-black/5">
                {enrolledBooks.map((b) => {
                  const s = planSettings[b.id] ?? { mode: "none", wordsPerDay: 20, fractionDen: 2 };
                  const update = (patch: Partial<PlanSetting>) =>
                    setPlanSettings((prev) => ({ ...prev, [b.id]: { ...s, ...patch } }));
                  return (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 py-4">
                      <div className="flex-1 min-w-0 font-medium truncate">{b.name}</div>
                      <select
                        value={s.mode}
                        onChange={(e) => update({ mode: e.target.value as PlanSetting["mode"] })}
                        className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
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
                          aria-label={`${b.name}每日数量`}
                          className="w-20 rounded-xl border border-black/15 px-3 py-2 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={savePlans}
                disabled={savingPlans}
                className="rounded-xl bg-foreground px-6 py-3 font-bold text-white transition hover:bg-accent disabled:opacity-50"
              >
                {savingPlans ? "保存中…" : "保存"}
              </button>
              {plansSaved && <span className="text-sm text-green-500">已保存</span>}
              {plansError && <span className="text-sm text-red-500">{plansError}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
