"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDots,
  ChartLineUp,
  CheckCircle,
  GearSix,
  Palette,
  PencilLine,
  SignOut,
  SlidersHorizontal,
  Target,
  UploadSimple,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import {
  applyThemeVars,
  DEFAULT_THEME,
  getPreset,
  getThemeVars,
  hexColor,
  THEME_PRESETS,
  type ThemeState,
} from "@/lib/theme";

type ThemeColorKey = "background" | "foreground" | "accent" | "accent2";

const CUSTOM_KEYS: { key: ThemeColorKey; label: string }[] = [
  { key: "background", label: "页面背景" },
  { key: "foreground", label: "主文字" },
  { key: "accent", label: "主强调色" },
  { key: "accent2", label: "次强调色" },
];

interface Me {
  username: string;
  role: string;
  parentCanLearn: boolean;
  avatarUrl: string | null;
  dailyNewTarget: number;
  dailyReviewTarget: number;
  customDailyNewTarget: number | null;
  customDailyReviewTarget: number | null;
  defaultCheckMode: string;
  theme?: ThemeState;
}

interface BookInfo {
  id: string;
  status: string;
  total: number;
  learned: number;
  mastered: number;
  enrolled: boolean;
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

type TabId = "progress" | "daily" | "account";

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [writing, setWriting] = useState<WritingOverview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<TabId>("progress");
  const router = useRouter();

  // 每日任务表单
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [checkMode, setCheckMode] = useState("spell");
  const [dailySaved, setDailySaved] = useState(false);
  const [dailyErr, setDailyErr] = useState("");

  // 账号设置
  const [theme, setTheme] = useState<ThemeState>(DEFAULT_THEME);
  const [avatarMsg, setAvatarMsg] = useState("");
  // 上传成功后递增，用于头像 URL 版本号，避免每次渲染都重新下载
  const [avatarVer, setAvatarVer] = useState(0);
  const [themeSaved, setThemeSaved] = useState(false);
  const [themeErr, setThemeErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // 修改密码
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  async function changePassword() {
    setPwErr("");
    setPwMsg("");
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setPwErr(d.error || "修改失败，请重试");
      return;
    }
    setPwCurrent("");
    setPwNew("");
    setPwMsg("✓ 密码已修改");
    setTimeout(() => setPwMsg(""), 2500);
  }

  function applyMe(user: Me) {
    setMe(user);
    setNewTarget(user.dailyNewTarget);
    setReviewTarget(user.dailyReviewTarget);
    setCheckMode(user.defaultCheckMode || "spell");
    if (user.theme) setTheme(user.theme);
  }

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
      applyMe(auth.user);
      setBooks(bookData?.books ?? []);
      setSession(sessionData);
      setWriting(writingData);
      setLoaded(true);
    });
  }, [router]);

  // 保存 / 恢复默认后重新拉取生效值与个人覆写标记
  async function refreshMe() {
    const r = await fetch("/api/auth/me");
    const d = await r.json();
    if (d.user) applyMe(d.user);
  }

  async function saveDaily() {
    setDailyErr("");
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyNewTarget: Number(newTarget),
        dailyReviewTarget: Number(reviewTarget),
        defaultCheckMode: checkMode,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setDailyErr(d.error || "保存失败，请重试");
      return;
    }
    setDailySaved(true);
    setTimeout(() => setDailySaved(false), 2000);
    refreshMe();
  }

  // 恢复全局默认：对应字段 PATCH null
  async function restoreDefault(field: "dailyNewTarget" | "dailyReviewTarget") {
    setDailyErr("");
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: null }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setDailyErr(d.error || "恢复默认失败，请重试");
      return;
    }
    refreshMe();
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.append("avatar", f);
    const res = await fetch("/api/settings", { method: "POST", body: form });
    const d = await res.json();
    if (res.ok) {
      setMe((prev) => (prev ? { ...prev, avatarUrl: d.avatarUrl } : prev));
      setAvatarVer((v) => v + 1);
      setAvatarMsg("✓ 头像已更新");
      router.refresh();
    } else {
      setAvatarMsg(d.error || "上传失败");
    }
    setTimeout(() => setAvatarMsg(""), 2500);
  }

  function selectPreset(id: string) {
    const next: ThemeState = { ...theme, presetId: id };
    if (id !== "custom") {
      next.custom = getPreset(id)?.vars ?? DEFAULT_THEME.custom;
    }
    setTheme(next);
    applyThemeVars(getThemeVars(next));
  }

  function updateCustom(key: ThemeColorKey, value: string) {
    const clean = hexColor(value);
    const next: ThemeState = {
      ...theme,
      presetId: "custom",
      custom: { ...theme.custom, [key]: clean },
    };
    setTheme(next);
    applyThemeVars(getThemeVars(next));
  }

  async function saveTheme() {
    setThemeErr("");
    const r = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setThemeErr(d.error || "保存失败，请重试");
      return;
    }
    setThemeSaved(true);
    setTimeout(() => setThemeSaved(false), 2000);
    router.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!loaded || !me) {
    return <div className="p-10 text-center text-black/40">正在整理你的学习进度…</div>;
  }

  const readyBooks = books.filter((book) => book.status === "ready" && book.enrolled);
  const totalWords = readyBooks.reduce((sum, book) => sum + book.total, 0);
  const learnedWords = readyBooks.reduce((sum, book) => sum + book.learned, 0);
  const masteredWords = readyBooks.reduce((sum, book) => sum + book.mastered, 0);
  const progress = totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0;
  const writingAssessmentDone = !!writing?.profile && writing.profile.assessmentStatus !== "pending";
  const isParent = me.role === "parent";
  // 普通家长不可学习；学习型家长（parentCanLearn）与普通用户一致
  const canLearn = !isParent || me.parentCanLearn;
  const activeTab: TabId = canLearn ? tab : "account";

  const tabs: { id: TabId; label: string; icon: typeof ChartLineUp }[] = [
    ...(canLearn
      ? [
          { id: "progress" as TabId, label: "学习进度", icon: ChartLineUp },
          { id: "daily" as TabId, label: "每日任务", icon: CalendarDots },
        ]
      : []),
    { id: "account" as TabId, label: "账号设置", icon: GearSix },
  ];

  return (
    <div className="page-shell flex flex-col gap-6 sm:gap-8">
      <section className="overflow-hidden rounded-[2rem] bg-foreground p-6 text-white shadow-[0_24px_60px_rgba(58,46,92,0.2)] sm:p-8 lg:p-10">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/avatars/${me.avatarUrl}?v=${avatarVer}`} alt={me.username} className="h-16 w-16 shrink-0 rounded-3xl object-cover sm:h-20 sm:w-20" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white/12 sm:h-20 sm:w-20">
              <UserCircle size={44} weight="duotone" />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-[0.16em] text-white/55 uppercase">My learning</div>
            <h1 className="mt-1 truncate text-3xl font-black sm:text-4xl">{me.username} 的学习空间</h1>
            <p className="mt-2 text-sm leading-6 text-white/65 sm:text-base">
              {isParent && !canLearn ? "在这里管理账号与孩子的学习入口。" : "进度、任务安排和系统评估，都集中在这里。"}
            </p>
          </div>
        </div>
      </section>

      {/* 页签 */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-black transition ${
                active
                  ? "bg-foreground text-white shadow-[0_10px_24px_rgba(58,46,92,0.18)]"
                  : "border border-black/6 bg-white/70 text-black/50 hover:border-accent/35 hover:text-accent"
              }`}
            >
              <Icon size={18} weight={active ? "fill" : "bold"} />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === "progress" && (
        <>
          <section>
            <div className="mb-4 flex items-end justify-between gap-4 px-1">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-accent"><ChartLineUp size={18} weight="bold" /> 学习进度</div>
                <h2 className="mt-1 text-2xl font-black">你正在稳步积累</h2>
              </div>
              <Link href="/" className="hidden items-center gap-1.5 text-sm font-bold text-foreground/60 hover:text-accent sm:flex">查看单词书 <ArrowRight size={16} weight="bold" /></Link>
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
              <div className="rounded-3xl bg-foreground p-5 text-white">
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

      {activeTab === "daily" && (
        <section className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
          <div className="flex items-center gap-2 text-sm font-bold text-accent"><Target size={19} weight="duotone" /> 每日任务目标</div>
          <h2 className="mt-2 text-2xl font-black">每天学多少</h2>
          <p className="mt-3 text-sm leading-6 text-black/48">
            当前生效：每日新词 <strong className="text-foreground">{me.dailyNewTarget}</strong> 词 · 每日复习上限 <strong className="text-foreground">{me.dailyReviewTarget}</strong> 词。不设置则跟随全局默认值。
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="text-sm font-bold text-black/60">每日新词目标（1-200）</label>
                {me.customDailyNewTarget !== null && (
                  <>
                    <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-bold text-accent">已自定义</span>
                    <button type="button" onClick={() => restoreDefault("dailyNewTarget")} className="text-xs font-bold text-black/40 underline hover:text-accent">恢复默认</button>
                  </>
                )}
              </div>
              <input
                type="number"
                min={1}
                max={200}
                value={newTarget}
                onChange={(e) => setNewTarget(Number(e.target.value))}
                className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 ring-accent"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="text-sm font-bold text-black/60">每日复习上限（1-500）</label>
                {me.customDailyReviewTarget !== null && (
                  <>
                    <span className="rounded-full bg-accent/12 px-2 py-0.5 text-xs font-bold text-accent">已自定义</span>
                    <button type="button" onClick={() => restoreDefault("dailyReviewTarget")} className="text-xs font-bold text-black/40 underline hover:text-accent">恢复默认</button>
                  </>
                )}
              </div>
              <input
                type="number"
                min={1}
                max={500}
                value={reviewTarget}
                onChange={(e) => setReviewTarget(Number(e.target.value))}
                className="w-full rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 ring-accent"
              />
            </div>
          </div>
          <div className="mt-5">
            <label className="mb-1 block text-sm font-bold text-black/60">复习时默认检查方式</label>
            <div className="flex gap-2 sm:max-w-sm">
              {[
                { v: "spell", label: "拼写检查" },
                { v: "choice", label: "选择检查" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setCheckMode(o.v)}
                  className={`flex-1 rounded-lg border py-2 font-bold ${
                    checkMode === o.v ? "border-transparent bg-foreground text-white" : "border-black/15"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <button
              type="button"
              onClick={saveDaily}
              className="min-h-11 rounded-2xl bg-foreground px-8 font-black text-white transition hover:-translate-y-0.5"
            >
              {dailySaved ? "✓ 已保存" : "保存"}
            </button>
            {dailyErr && <p className="text-sm text-red-500">{dailyErr}</p>}
          </div>
        </section>
      )}

      {activeTab === "account" && (
        <>
          <section className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
              <div className="flex items-center gap-2 text-sm font-bold text-accent"><UserCircle size={19} weight="duotone" /> 账号</div>
              <h2 className="mt-2 text-2xl font-black">{me.username}</h2>
              <div className="mt-6 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-black/20 transition-colors hover:border-accent"
                >
                  {me.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/avatars/${me.avatarUrl}?v=${avatarVer}`} alt="头像" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-black/40">上传头像</span>
                  )}
                </button>
                <div className="text-sm text-black/50">
                  点击头像可更换
                  {avatarMsg && <div className="mt-1 text-green-600">{avatarMsg}</div>}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={uploadAvatar}
                  className="hidden"
                />
              </div>
              <div className="mt-6 border-t border-black/6 pt-5">
                <div className="mb-3 text-sm font-bold text-black/60">修改密码</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="password"
                    placeholder="当前密码"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className="rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 ring-accent"
                  />
                  <input
                    type="password"
                    placeholder="新密码（至少4位）"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className="rounded-lg border border-black/10 px-3 py-2 outline-none focus:ring-2 ring-accent"
                  />
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={!pwCurrent || !pwNew}
                    className="min-h-10 rounded-xl bg-foreground px-6 text-sm font-black text-white transition hover:-translate-y-0.5 disabled:opacity-40"
                  >
                    确认修改
                  </button>
                  {pwMsg && <p className="text-sm text-green-600">{pwMsg}</p>}
                  {pwErr && <p className="text-sm text-red-500">{pwErr}</p>}
                </div>
              </div>
              <Link href="/me/binding" className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-black/6 p-4 transition hover:border-accent/35">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent"><Users size={21} weight="duotone" /></span>
                  <span><strong className="block">账号绑定</strong><span className="mt-0.5 block text-sm text-black/45">绑定家长或孩子账号</span></span>
                </span>
                <ArrowRight size={18} weight="bold" className="shrink-0 text-black/25" />
              </Link>
            </article>

            <article className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
              <div className="flex items-center gap-2 text-sm font-bold text-accent"><Palette size={19} weight="duotone" /> 外观</div>
              <h2 className="mt-2 text-2xl font-black">配色主题</h2>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPreset(p.id)}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors ${
                      theme.presetId === p.id
                        ? "border-accent bg-accent/10"
                        : "border-black/10 hover:bg-black/[.02]"
                    }`}
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                      style={{
                        background: `linear-gradient(135deg, ${p.vars.accent} 50%, ${p.vars.background} 50%)`,
                      }}
                    />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
              {theme.presetId === "custom" && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {CUSTOM_KEYS.map(({ key, label }) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-xs text-black/60">{label}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={theme.custom[key]}
                          onChange={(e) => updateCustom(key, e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded border-0 p-0"
                        />
                        <input
                          type="text"
                          value={theme.custom[key]}
                          onChange={(e) => updateCustom(key, e.target.value)}
                          className="flex-1 rounded-lg border px-2 py-1.5 text-sm uppercase outline-none focus:ring-2 ring-accent"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-6 flex items-center gap-4">
                <button
                  type="button"
                  onClick={saveTheme}
                  className="min-h-11 rounded-2xl bg-foreground px-8 font-black text-white transition hover:-translate-y-0.5"
                >
                  {themeSaved ? "✓ 已保存" : "保存主题"}
                </button>
                {themeErr && <p className="text-sm text-red-500">{themeErr}</p>}
              </div>
            </article>
          </section>

          {/* 移动端底部 Tab 没有这些入口 */}
          <section className="rounded-[2rem] border border-black/6 bg-white/78 p-6 shadow-[0_14px_36px_rgba(58,46,92,0.07)] sm:p-7">
            <div className="flex flex-col gap-1">
              <Link href="/import" className="flex items-center justify-between py-2.5 text-sm font-bold hover:opacity-70">
                <span className="inline-flex items-center gap-2"><UploadSimple size={18} weight="bold" /> 导入单词书</span>
                <ArrowRight size={16} weight="bold" className="text-black/25" />
              </Link>
              {me.role === "admin" && (
                <Link href="/admin" className="flex items-center justify-between border-t border-black/5 py-2.5 text-sm font-bold hover:opacity-70">
                  <span className="inline-flex items-center gap-2"><SlidersHorizontal size={18} weight="bold" /> 管理后台</span>
                  <ArrowRight size={16} weight="bold" className="text-black/25" />
                </Link>
              )}
            </div>
          </section>
        </>
      )}

      <button type="button" onClick={logout} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-black/8 bg-white/45 font-bold text-black/48 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 sm:w-auto sm:self-start sm:px-6">
        <SignOut size={20} weight="bold" />
        退出登录
      </button>
    </div>
  );
}
