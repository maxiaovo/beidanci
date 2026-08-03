"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BilingualTeachingText, WritingPrompt } from "@/lib/writing-types";

type Json = Record<string, unknown>;

interface Profile {
  assessmentStatus: string;
  abilityBand: string;
  abilitySummary: string;
  dimensions: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  completedTasks: number;
}

interface Overview {
  profile: Profile | null;
  review: { required: boolean; dueTotal: number; todayCount: number; sessionId: string | null };
  activeSession: { id: string; title: string; mode: string } | null;
  recent: { id: string; title: string; mode: string; kind: string; status: string; updatedAt: string }[];
}

interface Feedback {
  summary?: string;
  capability?: string;
  strengths?: string[];
  issues?: { category: string; severity: string; original: string; correction: string; explanation: string }[];
  blockingIssues?: string[];
  improvedVersion?: string;
  modelAnswer?: string;
  hints?: { keywords?: string[]; frame?: string; guidedSteps?: string[] };
}

interface Attempt {
  id: string;
  version: number;
  text: string;
  passed: boolean;
  feedback: Feedback;
  createdAt: string;
}

interface Task {
  id: string;
  orderIndex: number;
  type: string;
  prompt: WritingPrompt;
  status: string;
  hintLevel: number;
  failedRounds: number;
  attempts: Attempt[];
}

interface Session {
  id: string;
  title: string;
  mode: string;
  kind: string;
  status: string;
  messages: { id: string; role: string; content: string }[];
  tasks: Task[];
}

interface GeneratedTopic { title: string; prompt: string; genre: string; length: string }

const CATEGORY_LABEL: Record<string, string> = {
  grammar: "语法", vocabulary: "词汇", naturalness: "自然表达", clarity: "清晰度",
  register: "语体", spelling: "拼写标点", structure: "结构",
};

function requestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export default function WritingPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"practice" | "history" | "profile">("practice");
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState("");
  const [topic, setTopic] = useState("");
  const [genre, setGenre] = useState("日常表达");
  const [length, setLength] = useState("1–3 句");
  const [topics, setTopics] = useState<GeneratedTopic[]>([]);
  const [hint, setHint] = useState<Json | null>(null);
  const [showExample, setShowExample] = useState(true);
  const [flashFeedback, setFlashFeedback] = useState<{ feedback: Feedback; passed: boolean } | null>(null);

  const loadOverview = useCallback(async () => {
    const r = await fetch("/api/writing/overview");
    if (r.status === 401) return router.push("/login");
    const data = await r.json();
    if (r.ok) setOverview(data);
  }, [router]);

  const loadSession = useCallback(async (id: string) => {
    const r = await fetch(`/api/writing/sessions/${id}`);
    const data = await r.json();
    if (r.ok) {
      setSession(data.session);
      setDraft("");
      setHint(null);
      setShowExample(true);
      setFlashFeedback(null);
    } else setError(data.error || "读取练习失败");
  }, []);

  useEffect(() => {
    fetch("/api/writing/overview").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.ok) setOverview(await r.json());
    });
  }, [router]);

  const activeTask = useMemo(() => session?.tasks.find((task) => task.status === "active") ?? null, [session]);
  const latestAttempt = activeTask?.attempts.at(-1) ?? null;

  async function post(path: string, body?: Json) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "操作失败");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start(mode: string, extra: Json = {}) {
    const data = await post("/api/writing/sessions", { mode, ...extra });
    if (data?.sessionId) {
      await Promise.all([loadSession(data.sessionId), loadOverview()]);
      setView("practice");
    }
    if (data?.topics) setTopics(data.topics);
  }

  async function submitAttempt() {
    if (!activeTask || !draft.trim()) return;
    const data = await post(`/api/writing/tasks/${activeTask.id}/attempts`, { text: draft, clientRequestId: requestId() });
    if (data) {
      await Promise.all([loadSession(session!.id), loadOverview()]);
      setFlashFeedback({ feedback: data.attempt.feedback, passed: data.passed });
      if (!data.passed) setDraft("");
    }
  }

  async function unlockHint() {
    if (!activeTask) return;
    const data = await post(`/api/writing/tasks/${activeTask.id}/hint`);
    if (data) {
      setHint(data.hint);
      setShowExample(data.level < 3);
      await loadSession(session!.id);
    }
  }

  async function sendChat() {
    if (!session || !chat.trim()) return;
    const data = await post(`/api/writing/sessions/${session.id}/messages`, { content: chat });
    if (data) {
      setChat("");
      await loadSession(session.id);
    }
  }

  async function deleteSession(id: string) {
    if (!confirm("删除这次练习、聊天、批改和由它产生的错点记忆？")) return;
    const r = await fetch(`/api/writing/sessions/${id}`, { method: "DELETE" });
    if (r.ok) {
      if (session?.id === id) setSession(null);
      await loadOverview();
    }
  }

  if (!overview) return <div className="p-10 text-center text-black/40">加载写作档案…</div>;

  if (!overview.profile || overview.profile.assessmentStatus === "pending") {
    return <Onboarding busy={busy} error={error} save={async (values) => {
      const r = await fetch("/api/writing/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await r.json();
      if (!r.ok) return setError(data.error || "保存失败");
      await loadOverview();
      if (values.levelKind === "unknown") await start("diagnostic");
    }} />;
  }

  return (
    <div className="page-shell flex flex-col gap-6">
      <header className="rounded-[2rem] bg-foreground p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/55">Writing workshop</div>
            <h1 className="mt-2 text-3xl font-black">把想说的话，扎扎实实写出来</h1>
            <p className="mt-3 max-w-3xl text-white/68">{overview.profile.abilitySummary}</p>
          </div>
          <div className="flex rounded-xl bg-white/10 p-1 text-sm">
            {(["practice", "history", "profile"] as const).map((item) => (
              <button key={item} onClick={() => setView(item)} className={`rounded-lg px-4 py-2 ${view === item ? "bg-white text-foreground font-bold" : "text-white/70"}`}>
                {item === "practice" ? "练习" : item === "history" ? "记录" : "档案"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {view === "history" ? (
        <History recent={overview.recent} open={loadSession} remove={deleteSession} />
      ) : view === "profile" ? (
        <ProfilePanel profile={overview.profile} reload={loadOverview} />
      ) : session ? (
        <Workspace
          session={session}
          activeTask={activeTask}
          latestAttempt={latestAttempt}
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          chat={chat}
          setChat={setChat}
          hint={hint}
          flashFeedback={flashFeedback}
          showExample={showExample}
          setShowExample={setShowExample}
          submit={submitAttempt}
          sendChat={sendChat}
          unlockHint={unlockHint}
          close={() => { setSession(null); void loadOverview(); }}
        />
      ) : overview.review.required ? (
        <section className="rounded-[2rem] border-2 border-orange-200 bg-orange-50 p-7">
          <div className="text-sm font-bold text-orange-600">今日先结硬寨</div>
          <h2 className="mt-2 text-2xl font-black">先完成 {overview.review.todayCount} 个到期错点</h2>
          <p className="mt-2 text-black/55">系统只取最重要的 5 个以内。全部过关后，今天的新写作就会开放。</p>
          <button disabled={busy} onClick={() => overview.review.sessionId ? loadSession(overview.review.sessionId) : start("review")} className="mt-5 rounded-xl bg-foreground px-6 py-3 font-bold text-white disabled:opacity-50">
            {overview.review.sessionId ? "继续复练" : "开始复练"}
          </button>
        </section>
      ) : (
        <PracticeMenu
          busy={busy}
          active={overview.activeSession}
          open={loadSession}
          start={start}
          topic={topic}
          setTopic={setTopic}
          genre={genre}
          setGenre={setGenre}
          length={length}
          setLength={setLength}
          topics={topics}
        />
      )}
    </div>
  );
}

function Onboarding({ busy, error, save }: { busy: boolean; error: string; save: (values: Json) => Promise<void> }) {
  const [levelKind, setLevelKind] = useState("unknown");
  const [levelValue, setLevelValue] = useState("");
  const [score, setScore] = useState("");
  const [note, setNote] = useState("");
  const [goal, setGoal] = useState("daily");
  return (
    <div className="page-shell max-w-4xl">
      <section className="rounded-[2rem] bg-white p-6 shadow-xl sm:p-9">
        <div className="text-sm font-bold text-accent">写作档案 · 第一步</div>
        <h1 className="mt-2 text-3xl font-black">先从你现在的位置出发</h1>
        <p className="mt-3 text-black/50">知道水平就告诉系统；不知道也没关系，我们用 3 个单句开始摸底，必要时再写一小段。</p>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold">我对当前水平的了解
            <select value={levelKind} onChange={(e) => setLevelKind(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white p-3 font-normal">
              <option value="unknown">不知道，请帮我摸底</option><option value="grade">按年级</option><option value="exam">按考试及分数</option><option value="cefr">按 CEFR</option><option value="custom">自由描述</option>
            </select>
          </label>
          {levelKind !== "unknown" && <label className="text-sm font-bold">具体情况
            {levelKind === "exam" ? (
              <select value={levelValue} onChange={(e) => setLevelValue(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white p-3 font-normal">
                <option value="">请选择</option>{["中考", "高考", "CET-4", "CET-6", "考研英语", "IELTS", "TOEFL", "TOEIC"].map((x) => <option key={x}>{x}</option>)}
              </select>
            ) : <input value={levelValue} onChange={(e) => setLevelValue(e.target.value)} placeholder={levelKind === "grade" ? "如：初二、高一、大学" : levelKind === "cefr" ? "如：A2、B1" : "描述你的学习经历"} className="mt-2 w-full rounded-xl border border-black/10 p-3 font-normal" />}
          </label>}
          {levelKind === "exam" && <label className="text-sm font-bold">最近分数（可选）<input value={score} onChange={(e) => setScore(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 p-3 font-normal" /></label>}
          <label className="text-sm font-bold">主要目标
            <select value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-2 w-full rounded-xl border border-black/10 bg-white p-3 font-normal"><option value="daily">日常自然表达</option><option value="exam">考试写作</option><option value="genre">各类体裁</option></select>
          </label>
        </div>
        <label className="mt-5 block text-sm font-bold">还想让系统知道什么（可选）<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-black/10 p-3 font-normal" /></label>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button disabled={busy} onClick={() => save({ levelKind, levelValue, score, note, goal, genres: [] })} className="mt-6 rounded-xl bg-foreground px-7 py-3 font-bold text-white disabled:opacity-50">{busy ? "准备中…" : levelKind === "unknown" ? "开始 8 分钟摸底" : "建立档案并开始"}</button>
      </section>
    </div>
  );
}

function PracticeMenu(props: { busy: boolean; active: Overview["activeSession"]; open: (id: string) => Promise<void>; start: (mode: string, extra?: Json) => Promise<void>; topic: string; setTopic: (x: string) => void; genre: string; setGenre: (x: string) => void; length: string; setLength: (x: string) => void; topics: GeneratedTopic[] }) {
  return <div className="grid gap-5 lg:grid-cols-2">
    {props.active && <button onClick={() => props.open(props.active!.id)} className="rounded-2xl border-2 border-accent/30 bg-accent/10 p-6 text-left lg:col-span-2"><div className="text-sm font-bold text-accent">未完成</div><div className="mt-1 text-xl font-black">继续：{props.active.title}</div></button>}
    <section className="rounded-2xl bg-white p-6 shadow"><h2 className="text-xl font-black">我有题目</h2><input value={props.topic} onChange={(e) => props.setTopic(e.target.value)} maxLength={200} placeholder="输入题目或想写的内容" className="mt-4 w-full rounded-xl border border-black/10 p-3" /><div className="mt-3 flex gap-3"><select value={props.genre} onChange={(e) => props.setGenre(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white p-2"><option>日常表达</option><option>消息与邮件</option><option>日记</option><option>叙事</option><option>说明</option><option>议论</option><option>考试作文</option></select><select value={props.length} onChange={(e) => props.setLength(e.target.value)} className="rounded-xl border border-black/10 bg-white p-2"><option>1–3 句</option><option>60–100 词</option><option>120–180 词</option></select></div><button disabled={props.busy || !props.topic.trim()} onClick={() => props.start("topic", { topic: props.topic, genre: props.genre, length: props.length })} className="mt-4 rounded-xl bg-foreground px-5 py-2.5 font-bold text-white disabled:opacity-40">开始写</button></section>
    <section className="rounded-2xl bg-white p-6 shadow"><h2 className="text-xl font-black">帮我出题</h2><p className="mt-2 text-sm text-black/45">按你的水平和目标一次给 3 个不同题目。</p><button disabled={props.busy} onClick={() => props.start("generated")} className="mt-4 rounded-xl bg-accent px-5 py-2.5 font-bold text-white disabled:opacity-40">{props.topics.length ? "换一批" : "生成题目"}</button>{props.topics.map((item) => <button key={item.title} onClick={() => props.start("topic", { title: item.title, topic: item.prompt, genre: item.genre, length: item.length })} className="mt-3 block w-full rounded-xl border border-black/8 p-3 text-left hover:border-accent"><b>{item.title}</b><span className="mt-1 block text-xs text-black/45">{item.genre} · {item.length}</span></button>)}</section>
    {[{ mode: "free", title: "自由写一句", desc: "把此刻真正想说的话直接写成英文。" }, { mode: "translation", title: "从中文开始", desc: "先聊清楚想法，再把中文写成英文。" }, { mode: "imitation", title: "示范仿写", desc: "记住地道句子，隐藏后换场景重写。" }].map((item) => <button key={item.mode} disabled={props.busy} onClick={() => props.start(item.mode)} className="rounded-2xl bg-white p-6 text-left shadow transition hover:-translate-y-1 disabled:opacity-50"><h2 className="text-xl font-black">{item.title}</h2><p className="mt-2 text-sm text-black/45">{item.desc}</p></button>)}
  </div>;
}

function teachingText(text: BilingualTeachingText, language: "en" | "zh") {
  return language === "en" ? text.en : text.zh;
}

export function TeachingScaffold({ prompt, showExample, setShowExample }: { prompt: WritingPrompt; showExample: boolean; setShowExample: (value: boolean) => void }) {
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [translations, setTranslations] = useState<Set<number>>(new Set());
  const sentences = prompt.model?.sentences ?? [];

  function toggleTranslation(index: number) {
    setTranslations((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  if (!prompt.prewriting && !sentences.length && !prompt.example && !prompt.variation) return null;

  return (
    <div className="mt-4 flex flex-col gap-4">
      {prompt.prewriting && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Before you write</div>
              <h3 className="mt-1 text-lg font-black">{language === "en" ? "Think first. Write second." : "先想清楚，再落笔"}</h3>
            </div>
            <button
              type="button"
              onClick={() => setLanguage((current) => current === "en" ? "zh" : "en")}
              aria-label={language === "en" ? "切换为中文讲解" : "Switch explanations to English"}
              className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800"
            >
              {language === "en" ? "中文讲解" : "English"}
            </button>
          </div>
          <p className="mt-3 font-bold leading-7 text-amber-950">{teachingText(prompt.prewriting.coach, language)}</p>
          <div className="mt-3 rounded-xl bg-white/75 p-3 text-sm leading-6">
            <b>{language === "en" ? "Today’s goal: " : "本题目标："}</b>
            {teachingText(prompt.prewriting.goal, language)}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-black text-amber-900">{language === "en" ? "Your route" : "下笔路线"}</h4>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-amber-950">
                {prompt.prewriting.steps.map((step, index) => <li key={index}>{teachingText(step, language)}</li>)}
              </ol>
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900">{language === "en" ? "Quick check" : "提交前检查"}</h4>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-950">
                {prompt.prewriting.checklist.map((item, index) => <li key={index} className="flex gap-2"><span aria-hidden="true">□</span><span>{teachingText(item, language)}</span></li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {sentences.length > 0 ? (
        showExample ? (
          <section className="rounded-2xl border border-accent/25 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Model & explanation</div>
                <h3 className="mt-1 text-lg font-black">{language === "en" ? "See how the sentence works" : "看懂这句话怎么工作"}</h3>
              </div>
              {!prompt.prewriting && (
                <button type="button" onClick={() => setLanguage((current) => current === "en" ? "zh" : "en")} className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold">
                  {language === "en" ? "中文讲解" : "English"}
                </button>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-4">
              {sentences.map((sentence, index) => {
                const translated = translations.has(index);
                const translationId = `model-translation-${index}`;
                return (
                  <article key={`${sentence.english}-${index}`} className="rounded-xl bg-background p-4">
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 text-lg font-bold leading-8">{sentence.english}</p>
                      <button
                        type="button"
                        onClick={() => toggleTranslation(index)}
                        aria-label={translated ? "隐藏中文翻译" : "显示中文翻译"}
                        aria-pressed={translated}
                        aria-controls={translationId}
                        title={translated ? "隐藏中文翻译" : "显示中文翻译"}
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-black transition ${translated ? "border-accent bg-accent text-white" : "border-black/10 bg-white text-black/55 hover:border-accent hover:text-accent"}`}
                      >
                        T
                      </button>
                    </div>
                    {translated && <p id={translationId} className="mt-2 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-black/65">{sentence.translationZh}</p>}
                    <div className="mt-4 border-t border-black/8 pt-4 text-sm leading-6">
                      <p><span className="mr-2 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">{language === "en" ? "JOB" : "作用"}</span>{teachingText(sentence.role, language)}</p>
                      <p className="mt-3 text-black/70">{teachingText(sentence.explanation, language)}</p>
                      <div className="mt-3 rounded-lg bg-white p-3"><b>{language === "en" ? "Pattern to steal: " : "可以拿走的骨架："}</b><code className="break-words text-accent">{sentence.pattern}</code></div>
                      <p className="mt-3 text-black/60"><b>{language === "en" ? "Watch out: " : "容易踩的坑："}</b>{teachingText(sentence.pitfall, language)}</p>
                    </div>
                  </article>
                );
              })}
            </div>
            <button type="button" onClick={() => setShowExample(false)} className="mt-4 text-sm font-bold underline underline-offset-4">{language === "en" ? "I understand it — hide the model and let me write" : "我看懂了，隐藏示范开始仿写"}</button>
          </section>
        ) : (
          <button type="button" onClick={() => setShowExample(true)} className="w-fit text-sm font-bold text-black/45 underline underline-offset-4">{language === "en" ? "Show the model one more time" : "暂时再看一次示范"}</button>
        )
      ) : prompt.example ? (
        <div>{showExample ? <div className="rounded-xl border border-accent/25 bg-white p-4"><div className="text-xs font-bold text-accent">示范句</div><p className="mt-1 text-lg">{prompt.example}</p><button type="button" onClick={() => setShowExample(false)} className="mt-3 text-sm font-bold underline">我记住了，隐藏示范</button></div> : <button type="button" onClick={() => setShowExample(true)} className="text-sm text-black/40 underline">暂时再看一次示范</button>}</div>
      ) : null}

      {prompt.variation && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950"><b>变化要求：</b>{prompt.variation}</div>}
    </div>
  );
}

function Workspace(props: { session: Session; activeTask: Task | null; latestAttempt: Attempt | null; flashFeedback: { feedback: Feedback; passed: boolean } | null; draft: string; setDraft: (x: string) => void; busy: boolean; chat: string; setChat: (x: string) => void; hint: Json | null; showExample: boolean; setShowExample: (x: boolean) => void; submit: () => Promise<void>; sendChat: () => Promise<void>; unlockHint: () => Promise<void>; close: () => void }) {
  const { session, activeTask } = props;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-[2rem] bg-white p-5 shadow sm:p-7">
      <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-accent">{session.kind === "review" ? "错点复练" : "当前练习"}</div><h2 className="mt-1 text-2xl font-black">{session.title}</h2></div><button onClick={props.close} className="text-sm text-black/40 underline">返回</button></div>
      {session.mode === "translation" && session.tasks.length === 0 ? <div className="mt-6"><div className="flex max-h-96 flex-col gap-3 overflow-y-auto">{session.messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-foreground text-white" : "bg-black/[.04]"}`}>{message.content}</div>)}</div><div className="mt-4 flex gap-2"><textarea value={props.chat} onChange={(e) => props.setChat(e.target.value)} maxLength={1000} rows={3} placeholder="用中文说说你的想法…" className="min-w-0 flex-1 rounded-xl border border-black/10 p-3" /><button disabled={props.busy || !props.chat.trim()} onClick={props.sendChat} className="rounded-xl bg-foreground px-5 font-bold text-white disabled:opacity-40">发送</button></div></div> : activeTask ? <div className="mt-6">
        <div className="rounded-2xl bg-background p-5"><div className="text-sm font-bold text-accent">第 {activeTask.orderIndex + 1} 题</div><p className="mt-2 text-lg font-bold leading-8">{activeTask.prompt.instruction}</p>{activeTask.prompt.chinese && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-4">{activeTask.prompt.chinese}</div>}<TeachingScaffold key={activeTask.id} prompt={activeTask.prompt} showExample={props.showExample} setShowExample={props.setShowExample} /></div>
        {props.flashFeedback ? <FeedbackCard feedback={props.flashFeedback.feedback} passed={props.flashFeedback.passed} /> : props.latestAttempt && <FeedbackCard feedback={props.latestAttempt.feedback} passed={props.latestAttempt.passed} />}
        {props.hint && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm"><div className="font-bold text-blue-700">本级帮助</div><pre className="mt-2 whitespace-pre-wrap font-sans text-blue-900">{Object.entries(props.hint).map(([key, value]) => `${key === "keywords" ? "关键词" : key === "frame" ? "句型骨架" : key === "modelAnswer" ? "示范" : "分步重建"}：${Array.isArray(value) ? value.join(" · ") : String(value)}`).join("\n")}</pre>{"modelAnswer" in props.hint && <button onClick={() => props.setShowExample(false)} className="mt-2 font-bold underline">隐藏示范，开始回忆重写</button>}</div>}
        <textarea value={props.draft} onChange={(e) => props.setDraft(e.target.value)} maxLength={5000} rows={activeTask.type === "article" ? 10 : 5} placeholder="在这里写英文…" className="mt-5 w-full rounded-2xl border border-black/10 p-4 text-lg leading-8 outline-none focus:ring-2 focus:ring-accent" />
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={props.busy || !props.draft.trim()} onClick={props.submit} className="rounded-xl bg-foreground px-6 py-3 font-bold text-white disabled:opacity-40">{props.busy ? "DeepSeek 正在批改…" : activeTask.attempts.length ? "提交改写" : "提交批改"}</button><button disabled={props.busy || activeTask.hintLevel >= 3} onClick={props.unlockHint} className="rounded-xl border border-black/10 px-5 py-3 text-sm font-bold disabled:opacity-35">{activeTask.hintLevel === 0 ? "给我关键词" : activeTask.hintLevel === 1 ? "给我句型骨架" : "给我示范并分步重建"}</button></div>
      </div> : <div className="py-10 text-center"><div className="text-4xl">✓</div><h3 className="mt-3 text-2xl font-black">本次练习已完成</h3><p className="mt-2 text-black/45">错点已经进入记忆队列，系统会稍微变样后再考你。</p>{props.flashFeedback && <div className="text-left"><FeedbackCard feedback={props.flashFeedback.feedback} passed={props.flashFeedback.passed} /></div>}<button onClick={props.close} className="mt-5 rounded-xl bg-foreground px-6 py-3 font-bold text-white">回到写作首页</button></div>}
    </section>
    <aside className="rounded-[2rem] bg-white p-5 shadow"><h3 className="font-black">本次进度</h3><div className="mt-4 flex flex-col gap-3">{session.tasks.map((task) => <div key={task.id} className={`rounded-xl border p-3 text-sm ${task.status === "passed" ? "border-green-200 bg-green-50" : task.id === activeTask?.id ? "border-accent bg-accent/5" : "border-black/5"}`}><b>第 {task.orderIndex + 1} 题</b><span className="float-right">{task.status === "passed" ? "已过关" : `${task.attempts.length} 次尝试`}</span></div>)}</div>{session.messages.length > 0 && <details className="mt-5"><summary className="cursor-pointer font-bold">想法聊天记录</summary><div className="mt-2 flex flex-col gap-2 text-sm">{session.messages.map((m) => <div key={m.id} className="rounded-lg bg-black/[.03] p-2"><b>{m.role === "user" ? "我" : "教练"}：</b>{m.content}</div>)}</div></details>}</aside>
  </div>;
}

export function FeedbackCard({ feedback, passed }: { feedback: Feedback; passed: boolean }) {
  return <div className={`mt-5 rounded-2xl border p-5 ${passed ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"}`}><div className="font-black">{passed ? "✓ 本轮过关" : "还要再打磨一轮"}</div><p className="mt-2 text-sm leading-6">{feedback.summary}</p>{feedback.strengths?.length ? <div className="mt-3"><b className="text-sm text-green-700">做得好的地方</b><ul className="mt-1 list-disc pl-5 text-sm">{feedback.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}{feedback.issues?.length ? <div className="mt-4 flex flex-col gap-2">{feedback.issues.map((issue, index) => <div key={`${issue.category}-${index}`} className="rounded-xl bg-white/70 p-3 text-sm"><div className="font-bold">{CATEGORY_LABEL[issue.category] ?? issue.category}{issue.severity === "blocking" && <span className="ml-2 text-red-500">必须改</span>}</div>{issue.original && <div className="mt-1 text-red-500 line-through">{issue.original}</div>}{issue.correction && <div className="text-green-700">→ {issue.correction}</div>}<p className="mt-1 text-black/60">{issue.explanation}</p></div>)}</div> : null}{feedback.improvedVersion && <details className="mt-4"><summary className="cursor-pointer text-sm font-bold">查看整理后的版本</summary><p className="mt-2 rounded-xl bg-white p-3 leading-7">{feedback.improvedVersion}</p></details>}</div>;
}

function History({ recent, open, remove }: { recent: Overview["recent"]; open: (id: string) => Promise<void>; remove: (id: string) => Promise<void> }) {
  return <section className="rounded-[2rem] bg-white p-6 shadow"><h2 className="text-2xl font-black">写作记录</h2>{recent.length === 0 ? <p className="mt-6 text-black/40">还没有写作记录</p> : <div className="mt-5 divide-y divide-black/5">{recent.map((item) => <div key={item.id} className="flex items-center gap-4 py-4"><button onClick={() => open(item.id)} className="min-w-0 flex-1 text-left"><b className="block truncate">{item.title || "未命名练习"}</b><span className="text-xs text-black/40">{item.kind === "review" ? "错点复练" : item.mode} · {item.status === "completed" ? "已完成" : "未完成"} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</span></button><button onClick={() => remove(item.id)} className="text-sm text-red-400">删除</button></div>)}</div>}</section>;
}

function ProfilePanel({ profile, reload }: { profile: Profile; reload: () => Promise<void> }) {
  async function reset() { if (confirm("重新摸底会清空当前能力判断，但保留历史练习。继续吗？")) { await fetch("/api/writing/profile/reset", { method: "POST" }); await reload(); } }
  async function erase() { if (prompt("输入“清空全部写作数据”确认不可恢复的删除") === "清空全部写作数据") { await fetch("/api/writing/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "清空全部写作数据" }) }); location.reload(); } }
  return <section className="rounded-[2rem] bg-white p-6 shadow"><h2 className="text-2xl font-black">我的写作档案</h2><p className="mt-3 text-lg">{profile.abilitySummary}</p><div className="mt-5 grid gap-3 sm:grid-cols-5">{Object.entries(profile.dimensions).map(([key, value]) => <div key={key} className="rounded-xl bg-background p-3 text-center"><div className="text-xs text-black/45">{CATEGORY_LABEL[key] ?? key}</div><b className="mt-1 block text-xl">{value}/5</b></div>)}</div><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><h3 className="font-bold text-green-700">稳定优势</h3><ul className="mt-2 list-disc pl-5 text-sm leading-6">{profile.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div><div><h3 className="font-bold text-orange-700">当前重点</h3><ul className="mt-2 list-disc pl-5 text-sm leading-6">{profile.weaknesses.map((x) => <li key={x}>{x}</li>)}</ul></div></div><div className="mt-7 flex flex-wrap gap-3 border-t border-black/5 pt-5"><button onClick={reset} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-bold">重新摸底</button><button onClick={erase} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-500">清空全部写作数据</button><Link href="/" className="ml-auto px-4 py-2 text-sm underline">返回首页</Link></div></section>;
}
