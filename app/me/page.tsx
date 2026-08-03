"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Books,
  Brain,
  CalendarDots,
  ChartLineUp,
  CheckCircle,
  GearSix,
  PencilLine,
  SignOut,
  Sparkle,
  Target,
  UserCircle,
} from "@phosphor-icons/react";

interface Me {
  username: string;
  role: string;
  avatarUrl: string | null;
  dailyNewTarget: number;
  dailyReviewTarget: number;
}

interface BookInfo {
  id: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
}

interface SessionPlan {
  bookId: string;
  bookName: string;
  quota: number;
  doneToday: number;
  remaining: number;
}

interface SessionData {
  plans?: SessionPlan[];
  stats: {
    dueCount: number;
    reviewsDoneToday: number;
    learnedToday: number;
  };
}

interface WritingOverview {
  profile: { assessmentStatus: string; abilitySummary: string } | null;
  review: { required: boolean; todayCount: number };
  activeSession: { id: string; title: string } | null;
}

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [writing, setWriting] = useState<WritingOverview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/books").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/session").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/writing/overview").then((r) => (r.ok ? r.json() : null)),
    ]).then(([auth, bookData, sessionData, writingData]) => {
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      setMe(auth.user);
      setBooks(bookData?.books ?? []);
      setSession(sessionData);
      setWriting(writingData);
      setLoaded(true);
    });
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!loaded || !me) {
    return <div className="p-10 text-center text-black/40">正在整理你的学习进度…</div>;
  }

  const readyBooks = books.filter((book) => book.status === "ready");
  const totalWords = readyBooks.reduce((sum, book) => sum + book.total, 0);
  const learnedWords = readyBooks.reduce((sum, book) => sum + book.learned, 0);
  const masteredWords = readyBooks.reduce((sum, book) => sum + book.mastered, 0);
  const progress = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;
  const writingAssessmentDone = !!writing?.profile && writing.profile.assessmentStatus !== "pending";
  const isParent = me.role === "parent";

  return (
    <div className="page-shell flex flex-col gap-6 sm:gap-8">
      <section className="overflow-hidden rounded-[2rem] bg-foreground p-6 text-white shadow-[0_24px_60px_rgba(58,46,92,0.2)] sm:p-8 lg:p-10">
        <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/avatars/${me.avatarUrl}`} alt={me.username} className="h-16 w-16 shrink-0 rounded-3xl object-cover sm:h-20 sm:w-20" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/12 sm:h-20 sm:w-20">
                <UserCircle size={44} weight="duotone" />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-[0.16em] text-white/55 uppercase">My learning</div>
              <h1 className="mt-1 truncate text-3xl font-black sm:text-4xl">{me.username} 的学习空间</h1>
              <p className="mt-2 text-sm leading-6 text-white/65 sm:text-base">
                {isParent ? "在这里管理账号与孩子的学习入口。" : "进度、任务安排和系统评估，都集中在这里。"}
              </p>
            </div>
          </div>
          <Link href="/settings" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-black text-foreground transition hover:-translate-y-0.5">
            <GearSix size={20} weight="bold" />
            系统设置
          </Link>
        </div>
      </section>

      {!isParent && (
        <>
          <section>
            <div className="mb-4 flex items-end justify-between gap-4 px-1">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-accent"><ChartLineUp size={18} weight="bold" /> 学习进度</div>
                <h2 className="mt-1 text-2xl font-black">你正在稳步积累</h2>
              </div>
              <Link href="/words" className="hidden items-center gap-1.5 text-sm font-bold text-foreground/60 hover:text-accent sm:flex">查看单词书 <ArrowRight size={16} weight="bold" /></Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "单词总进度", value: `${progress}%`, note: `${learnedWords}/${totalWords || 0} 词`, icon: Target },
                { label: "已经掌握", value: masteredWords, note: "可稳定回忆的单词", icon: CheckCircle },
                { label: "今日新词", value: session?.stats.learnedToday ?? 0, note: `目标 ${me.dailyNewTarget} 词`, icon: BookOpen },
                { label: "今日复习", value: session?.stats.reviewsDoneToday ?? 0, note: `待复习 ${session?.stats.dueCount ?? 0} 词`, icon: Brain },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <article key={item.label} className="rounded-3xl border border-black/6 bg-white/78 p-5 shadow-[0_12px_32px_rgba(58,46,92,0.07)]">
                    <div className="flex items-center justify-between gap-3 text-sm font-bold text-black/42"><span>{item.label}</span><Icon size={22} weight="duotone" className="text-accent" /></div>
                    <div className="mt-4 text-4xl font-black tracking-tight text-foreground">{item.value}</div>
                    <p className="mt-2 text-sm text-black/42">{item.note}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-accent"><CalendarDots size={19} weight="duotone" /> 每日任务安排</div>
                  <h2 className="mt-2 text-2xl font-black">今天怎么学</h2>
                </div>
                <Link href="/?plan=1" className="rounded-xl border border-black/9 px-3 py-2 text-sm font-bold text-foreground/60 transition hover:border-accent/35 hover:text-accent">调整</Link>
              </div>
              <div className="mt-6 flex flex-col gap-3">
                {(session?.plans ?? []).length > 0 ? (session?.plans ?? []).map((plan) => (
                  <div key={plan.bookId} className="rounded-2xl bg-black/[0.035] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <strong className="truncate">{plan.bookName}</strong>
                      <span className="shrink-0 text-sm font-bold text-accent">{plan.doneToday}/{plan.quota}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/7">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${plan.quota > 0 ? Math.min(100, (plan.doneToday / plan.quota) * 100) : 100}%` }} />
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl bg-black/[0.035] p-4 text-sm leading-6 text-black/48">暂时没有按单词书设置计划，系统会使用每天 {me.dailyNewTarget} 个新词的默认目标。</div>
                )}
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-accent/8 p-4">
                  <div className="min-w-0"><strong className="block">写作</strong><span className="mt-1 block truncate text-sm text-black/45">{writing?.review.required ? `今天安排 ${writing.review.todayCount} 个错点复练` : writing?.activeSession ? `继续：${writing.activeSession.title}` : "按系统评估自动安排"}</span></div>
                  <PencilLine size={24} weight="duotone" className="shrink-0 text-accent" />
                </div>
              </div>
            </article>

            <article className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
              <div className="flex items-center gap-2 text-sm font-bold text-accent"><Sparkle size={19} weight="fill" /> 系统评估</div>
              <h2 className="mt-2 text-2xl font-black">系统如何看你的学习</h2>
              <div className="mt-6 rounded-3xl bg-foreground p-5 text-white">
                <div className="flex items-center gap-2 text-sm font-bold text-white/55"><PencilLine size={18} /> 写作能力</div>
                <p className="mt-3 text-lg font-bold leading-8">{writingAssessmentDone ? writing?.profile?.abilitySummary : "完成写作摸底后，系统会在这里给出能力摘要和下一步建议。"}</p>
                <Link href="/writing" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-white">{writingAssessmentDone ? "继续提升写作" : "完成写作摸底"}<ArrowRight size={16} weight="bold" /></Link>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-black/6 p-4">
                <div><strong className="block">单词记忆状态</strong><span className="mt-1 block text-sm text-black/45">当前有 {session?.stats.dueCount ?? 0} 个词等待巩固</span></div>
                <Link href="/check?mode=review" className="shrink-0 text-sm font-black text-accent">去复习</Link>
              </div>
            </article>
          </section>
        </>
      )}

      <section>
        <div className="mb-4 px-1">
          <div className="flex items-center gap-2 text-sm font-bold text-accent"><GearSix size={18} weight="bold" /> 管理中心</div>
          <h2 className="mt-1 text-2xl font-black">常用入口</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(isParent ? [
            { href: "/parent", title: "孩子学习", desc: "查看与管理孩子的学习情况", icon: ChartLineUp },
            { href: "/settings", title: "账号与外观", desc: "头像、主题和账号设置", icon: GearSix },
          ] : [
            { href: "/?plan=1", title: "每日任务", desc: "调整每本单词书的每日学习量", icon: CalendarDots },
            { href: "/words", title: "单词书", desc: "管理词书并查看分书进度", icon: Books },
            { href: "/writing", title: "写作训练", desc: "练习、历史记录与能力档案", icon: PencilLine },
            { href: "/settings", title: "系统设置", desc: "头像、学习目标、主题与偏好", icon: GearSix },
          ]).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} href={item.href} className="group flex min-h-28 items-center gap-4 rounded-3xl border border-black/6 bg-white/68 p-5 transition hover:-translate-y-1 hover:border-accent/35 hover:bg-white hover:shadow-[0_16px_36px_rgba(58,46,92,0.1)]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent"><Icon size={25} weight="duotone" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-lg font-black">{item.title}</strong><span className="mt-1 block text-sm leading-5 text-black/45">{item.desc}</span></span>
                <ArrowRight size={19} weight="bold" className="shrink-0 text-black/20 transition group-hover:translate-x-1 group-hover:text-accent" />
              </Link>
            );
          })}
        </div>
      </section>

      <button type="button" onClick={logout} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-black/8 bg-white/45 font-bold text-black/48 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:w-auto sm:self-start sm:px-6">
        <SignOut size={20} weight="bold" />
        退出登录
      </button>
    </div>
  );
}
