"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { BilingualTeachingText, WritingModelSentence, WritingPrompt } from "@/lib/writing-types";
import { diffWords, normalizeToken, type WordDiffResult } from "@/lib/word-diff";

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
  review: { required: boolean; dueTotal: number; todayCount: number; sessionId: string | null; allowSkip?: boolean };
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

  const loadSession = useCallback(async (id: string, reset = true) => {
    const r = await fetch(`/api/writing/sessions/${id}`);
    const data = await r.json();
    if (r.ok) {
      setSession(data.session);
      if (reset) {
        setDraft("");
        setHint(null);
        setShowExample(true);
        setFlashFeedback(null);
      }
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

  async function skipReview() {
    // 跳过今天的写作复练门禁（需管理员开启"允许跳过复习"），留痕给家长查看
    const data = await post("/api/skip-review", { module: "writing" });
    if (data) await loadOverview();
  }

  async function submitAttempt() {
    if (!activeTask || !draft.trim()) return;
    const data = await post(`/api/writing/tasks/${activeTask.id}/attempts`, { text: draft, clientRequestId: requestId() });
    if (data) {
      await Promise.all([loadSession(session!.id, false), loadOverview()]);
      setFlashFeedback({ feedback: data.attempt.feedback, passed: data.passed });
      if (data.passed) {
        setDraft("");
        setHint(null);
        setShowExample(true);
      } else if (data.guided) {
        // 连续 3 轮未过关：自动展示完整引导（关键词+骨架+示范+分步重建），不再等用户点提示按钮
        const feedback = data.attempt.feedback as Feedback;
        setHint({
          keywords: feedback.hints?.keywords ?? [],
          frame: feedback.hints?.frame ?? "",
          guidedSteps: feedback.hints?.guidedSteps ?? [],
          modelAnswer: feedback.modelAnswer ?? "",
        });
        setShowExample(false);
      }
    }
  }

  async function unlockHint() {
    if (!activeTask) return;
    const data = await post(`/api/writing/tasks/${activeTask.id}/hint`);
    if (data) {
      setHint(data.hint);
      setShowExample(data.level < 3);
      await loadSession(session!.id, false);
    }
  }

  async function sendChat() {
    if (!session || !chat.trim()) return;
    const data = await post(`/api/writing/sessions/${session.id}/messages`, { content: chat });
    if (data) {
      setChat("");
      await loadSession(session.id, false);
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
          error={error}
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
          {overview.review.allowSkip && (
            <div className="mt-4">
              <button disabled={busy} onClick={skipReview} className="text-sm text-black/40 underline underline-offset-4 hover:text-black/70 cursor-pointer disabled:opacity-50">
                跳过复习，直接练新内容（家长会看到记录）
              </button>
            </div>
          )}
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
        <p className="mt-3 text-black/50">知道水平就告诉系统；不知道也没关系，我们用 3 道小题摸底——写几句日常表达，不限时。</p>
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
        <button disabled={busy} onClick={() => save({ levelKind, levelValue, score, note, goal, genres: [] })} className="mt-6 rounded-xl bg-foreground px-7 py-3 font-bold text-white disabled:opacity-50">{busy ? "准备中…" : levelKind === "unknown" ? "开始摸底（3 道小题）" : "建立档案并开始"}</button>
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

function Bilingual({ text, enClassName = "" }: { text: BilingualTeachingText; enClassName?: string }) {
  const [showZh, setShowZh] = useState(false);
  return (
    <span className="block">
      <span className="flex items-start gap-2">
        <span className={`min-w-0 flex-1 ${enClassName}`}>{text.en}</span>
        <button
          type="button"
          onClick={() => setShowZh((current) => !current)}
          aria-label={showZh ? "隐藏中文翻译" : "显示中文翻译"}
          aria-pressed={showZh}
          title={showZh ? "隐藏中文翻译" : "显示中文翻译"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-black transition ${showZh ? "border-accent bg-accent text-white" : "border-black/10 bg-white text-black/45 hover:border-accent hover:text-accent"}`}
        >
          T
        </button>
      </span>
      {showZh && <span className="mt-1 block rounded-lg bg-white/80 px-2.5 py-1.5 text-[13px] leading-6 text-black/60">{text.zh}</span>}
    </span>
  );
}

function SentenceNotes({ sentence }: { sentence: WritingModelSentence }) {
  return (
    <div className="text-sm leading-6">
      <div>
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">JOB · 作用</span>
        <div className="mt-1.5"><Bilingual text={sentence.role} /></div>
      </div>
      <div className="mt-3 text-black/70"><Bilingual text={sentence.explanation} /></div>
      <div className="mt-3 rounded-lg bg-white p-3">
        <b>Pattern to steal · 可以拿走的骨架</b>
        {sentence.patternZh ? (
          <Bilingual text={{ en: sentence.pattern, zh: sentence.patternZh }} enClassName="break-words font-mono text-[13px] text-accent" />
        ) : (
          <code className="break-words text-accent">{sentence.pattern}</code>
        )}
      </div>
      <div className="mt-3 text-black/60">
        <b>Watch out · 容易踩的坑</b>
        <Bilingual text={sentence.pitfall} />
      </div>
    </div>
  );
}

export function TeachingScaffold({ prompt, showExample, setShowExample }: { prompt: WritingPrompt; showExample: boolean; setShowExample: (value: boolean) => void }) {
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
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Before you write · 动笔之前</div>
            <h3 className="mt-1 text-lg font-black">Think first. Write second.<span className="ml-2 text-sm font-bold text-black/40">先想清楚，再落笔</span></h3>
          </div>
          <div className="mt-3 font-bold leading-7 text-amber-950"><Bilingual text={prompt.prewriting.coach} /></div>
          <div className="mt-3 rounded-xl bg-white/75 p-3 text-sm leading-6">
            <b>Today’s goal · 本题目标</b>
            <Bilingual text={prompt.prewriting.goal} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-black text-amber-900">Your route · 下笔路线</h4>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-amber-950">
                {prompt.prewriting.steps.map((step, index) => <li key={index}><Bilingual text={step} /></li>)}
              </ol>
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-900">Quick check · 提交前检查</h4>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-amber-950">
                {prompt.prewriting.checklist.map((item, index) => <li key={index} className="flex gap-2"><span aria-hidden="true">□</span><span className="min-w-0 flex-1"><Bilingual text={item} /></span></li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {sentences.length > 0 ? (
        showExample ? (
          <section className="rounded-2xl border border-accent/25 bg-white p-4 sm:p-5">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Model & explanation · 示范与讲解</div>
              <h3 className="mt-1 text-lg font-black">See how the sentence works<span className="ml-2 text-sm font-bold text-black/40">看懂这句话怎么工作</span></h3>
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
                    <div className="mt-4 border-t border-black/8 pt-4"><SentenceNotes sentence={sentence} /></div>
                  </article>
                );
              })}
            </div>
            <button type="button" onClick={() => setShowExample(false)} className="mt-4 text-sm font-bold underline underline-offset-4">我看懂了，隐藏示范开始仿写</button>
          </section>
        ) : (
          <button type="button" onClick={() => setShowExample(true)} className="w-fit text-sm font-bold text-black/45 underline underline-offset-4">暂时再看一次示范</button>
        )
      ) : prompt.example ? (
        <div>{showExample ? <div className="rounded-xl border border-accent/25 bg-white p-4"><div className="text-xs font-bold text-accent">示范句</div><p className="mt-1 text-lg">{prompt.example}</p><button type="button" onClick={() => setShowExample(false)} className="mt-3 text-sm font-bold underline">我记住了，隐藏示范</button></div> : <button type="button" onClick={() => setShowExample(true)} className="text-sm text-black/40 underline">暂时再看一次示范</button>}</div>
      ) : null}

      {prompt.variation && <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950"><b>变化要求：</b>{prompt.variation}</div>}
    </div>
  );
}

function RecallTokens({ diff }: { diff: WordDiffResult }) {
  return (
    <>
      {diff.segments.map((seg, index) => {
        const space = index < diff.segments.length - 1 ? " " : "";
        if (seg.kind === "match") return <span key={index}>{seg.text}{space}</span>;
        if (seg.kind === "spelling") return (
          <span key={index}>
            <span className="rounded bg-amber-100 px-0.5 font-bold text-amber-800 underline decoration-amber-500 decoration-2 underline-offset-4">{seg.text}</span>
            <span className="ml-1 rounded bg-green-100 px-1 text-sm font-bold text-green-700">{seg.expected}</span>
            {space}
          </span>
        );
        if (seg.kind === "wording") return (
          <span key={index}>
            <span className="rounded bg-red-100 px-0.5 text-red-600 line-through">{seg.text}</span>
            <span className="ml-1 rounded bg-green-100 px-1 text-sm font-bold text-green-700">{seg.expected}</span>
            {space}
          </span>
        );
        if (seg.kind === "extra") return (
          <span key={index}>
            <span title="原句没有这个词" className="rounded bg-red-50 px-0.5 text-red-400 line-through">{seg.text}</span>
            {space}
          </span>
        );
        return (
          <span key={index}>
            <span title="这个词漏掉了" className="rounded border border-dashed border-black/30 px-1 text-black/35">{seg.text}</span>
            {space}
          </span>
        );
      })}
    </>
  );
}

function OriginalTokens({ text, diff }: { text: string; diff: WordDiffResult }) {
  const expectedNorms = new Set(
    diff.segments.flatMap((seg) => {
      if (seg.kind === "spelling" || seg.kind === "wording") return [normalizeToken(seg.expected)];
      if (seg.kind === "missing") return [normalizeToken(seg.text)];
      return [];
    }),
  );
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return (
    <>
      {tokens.map((token, index) => {
        const hit = expectedNorms.has(normalizeToken(token));
        return (
          <span key={index}>
            {hit ? <span className="rounded bg-amber-100 px-0.5 underline decoration-amber-500 decoration-2 underline-offset-4">{token}</span> : token}
            {index < tokens.length - 1 ? " " : ""}
          </span>
        );
      })}
    </>
  );
}

function CompareVerdict({ diff }: { diff: WordDiffResult }) {
  if (diff.identical) {
    return <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">✓ 一字不差，可以直接开始仿写。</p>;
  }
  const onlySpelling = diff.spelling.length > 0 && diff.wording.length === 0 && diff.missing.length === 0 && diff.extra.length === 0;
  if (onlySpelling) {
    return (
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        <b>意思全对，就差 {diff.spelling.length} 处拼写：</b>
        {diff.spelling.map((item) => `${item.wrote} → ${item.expected}`).join("；")}
      </p>
    );
  }
  const parts = [
    diff.spelling.length ? `拼写 ${diff.spelling.length}` : "",
    diff.wording.length ? `用词 ${diff.wording.length}` : "",
    diff.missing.length ? `漏词 ${diff.missing.length}` : "",
    diff.extra.length ? `多出 ${diff.extra.length}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <p className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-800">
      <b>有差异（{parts}）。</b>对照高亮处看一眼原句，建议再默一次巩固。
    </p>
  );
}

export function ImitationRitual({ prompt, onDone }: { prompt: WritingPrompt; onDone: () => void }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [recall, setRecall] = useState("");
  const [showTranslation, setShowTranslation] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const sentences = prompt.model?.sentences ?? [];
  const english = sentences.map((sentence) => sentence.english).join(" ");
  const translation = sentences.map((sentence) => sentence.translationZh).join(" ");
  const pattern = sentences.map((sentence) => sentence.pattern).join(" ");
  const stages = ["看示范", "默写", "对照", "仿写"];
  const diff = useMemo(() => (step === 2 ? diffWords(recall, english) : null), [step, recall, english]);
  const onlySpelling = !!diff && diff.spelling.length > 0 && diff.wording.length === 0 && diff.missing.length === 0 && diff.extra.length === 0;

  // 默写阶段：按住 Ctrl / ⌘ 偷看原句，松开即隐藏
  useEffect(() => {
    if (step !== 1) return;
    function down(e: KeyboardEvent) { if (e.key === "Control" || e.key === "Meta") setPeeking(true); }
    function up(e: KeyboardEvent) { if (e.key === "Control" || e.key === "Meta") setPeeking(false); }
    function hide() { setPeeking(false); }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", hide);
    };
  }, [step]);

  // 快捷键：⏎ 前进一步，⇧⏎ 再默一次，⌘/Ctrl+⏎ 默写完对照（在输入框里也生效）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      const typing = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
      const onControl = !!target?.closest("button, summary, a, select");
      if (step === 0 && !typing && !onControl) {
        e.preventDefault();
        setStep(1);
      } else if (step === 1 && (e.metaKey || e.ctrlKey) && recall.trim()) {
        e.preventDefault();
        setPeeking(false);
        setStep(2);
      } else if (step === 2 && !typing && !onControl) {
        e.preventDefault();
        if (e.shiftKey) setStep(1);
        else onDone();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, recall, onDone]);

  return (
    <div className="mt-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold">
        {stages.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${index <= step ? "border-accent bg-accent text-white" : "border-black/15 text-black/30"}`}>{index + 1}</span>
            <span className={index <= step ? "text-accent" : "text-black/30"}>{label}</span>
            {index < stages.length - 1 && <span className="text-black/20">→</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="mt-4 rounded-2xl border border-accent/25 bg-white p-6 text-center sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Model · 记住这句话</div>
          <div className="mx-auto mt-5 flex max-w-2xl items-start justify-center gap-3 text-left">
            <p className="min-w-0 text-2xl font-black leading-10">{english}</p>
            <button
              type="button"
              onClick={() => setShowTranslation((current) => !current)}
              aria-label={showTranslation ? "隐藏中文翻译" : "显示中文翻译"}
              aria-pressed={showTranslation}
              title={showTranslation ? "隐藏中文翻译" : "显示中文翻译"}
              className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-black transition ${showTranslation ? "border-accent bg-accent text-white" : "border-black/10 bg-white text-black/55 hover:border-accent hover:text-accent"}`}
            >
              T
            </button>
          </div>
          {showTranslation && <p className="mx-auto mt-3 max-w-2xl rounded-lg bg-background px-4 py-2 text-left text-sm leading-6 text-black/65">{translation}</p>}
          <details className="mx-auto mt-6 max-w-2xl text-left">
            <summary className="cursor-pointer text-sm font-bold text-black/50">想先吃透再默？展开逐句讲解</summary>
            <div className="mt-3 flex flex-col gap-3">
              {sentences.map((sentence, index) => <div key={index} className="rounded-xl bg-background p-4"><SentenceNotes sentence={sentence} /></div>)}
            </div>
          </details>
          <button type="button" onClick={() => setStep(1)} className="mt-7 rounded-xl bg-foreground px-7 py-3 font-bold text-white">我记住了，开始默写 →<kbd className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold">⏎</kbd></button>
        </section>
      )}

      {step === 1 && (
        <section className="mt-4 rounded-2xl border border-accent/25 bg-white p-6 sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Recall · 凭记忆重建</div>
          <p className="mt-3 text-sm leading-6 text-black/55">示范已经藏起来了。看着中文意思和句型骨架，把英文原句默出来。</p>
          <div className="mt-4 rounded-xl bg-background p-4">
            <div className="text-xs font-bold text-black/40">中文意思</div>
            <p className="mt-1 leading-7">{translation}</p>
            <div className="mt-3 text-xs font-bold text-black/40">句型骨架</div>
            <code className="mt-1 block break-words text-accent">{pattern}</code>
          </div>
          {peeking && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="text-xs font-bold text-amber-700">偷看一眼 · 松开就藏起来</div>
              <p className="mt-1 text-lg font-bold leading-8">{english}</p>
            </div>
          )}
          <textarea value={recall} onChange={(event) => setRecall(event.target.value)} maxLength={2000} rows={3} placeholder="在这里默写英文原句…" className="mt-4 w-full rounded-2xl border border-black/10 p-4 text-lg leading-8 outline-none focus:ring-2 focus:ring-accent" />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-xs text-black/40">按住 <kbd className="rounded border border-black/15 bg-white px-1">Ctrl</kbd> 或 <kbd className="rounded border border-black/15 bg-white px-1">⌘</kbd> 可偷看原句，或</p>
            <button
              type="button"
              aria-label="按住偷看原句"
              onPointerDown={(event) => { event.preventDefault(); setPeeking(true); }}
              onPointerUp={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
              onPointerCancel={() => setPeeking(false)}
              onContextMenu={(event) => event.preventDefault()}
              className="touch-none select-none rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 transition active:bg-amber-100"
            >
              按住偷看
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" disabled={!recall.trim()} onClick={() => setStep(2)} className="rounded-xl bg-foreground px-6 py-3 font-bold text-white disabled:opacity-40">写好了，对照原句<kbd className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold">⌘⏎</kbd></button>
            <button type="button" onClick={() => setStep(0)} className="text-sm font-bold text-black/45 underline underline-offset-4">想不起来，回去再看一眼</button>
          </div>
        </section>
      )}

      {step === 2 && diff && (
        <section className="mt-4 rounded-2xl border border-accent/25 bg-white p-6 sm:p-8">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Compare · 对照一下</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-background p-4">
              <div className="text-xs font-bold text-black/40">你默的</div>
              <p className="mt-1 leading-8"><RecallTokens diff={diff} /></p>
            </div>
            <div className="rounded-xl bg-background p-4">
              <div className="text-xs font-bold text-black/40">原句</div>
              <p className="mt-1 font-bold leading-8"><OriginalTokens text={english} diff={diff} /></p>
            </div>
          </div>
          <CompareVerdict diff={diff} />
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={onDone} className="rounded-xl bg-foreground px-6 py-3 font-bold text-white">可以了，开始仿写 →<kbd className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold">⏎</kbd></button>
            <button type="button" onClick={() => setStep(1)} className="rounded-xl border border-black/10 px-5 py-3 text-sm font-bold">{onlySpelling ? "再默一次，巩固拼写" : "还有差距，再默一次"}<kbd className="ml-2 rounded bg-black/5 px-1.5 py-0.5 text-xs font-bold">⇧⏎</kbd></button>
          </div>
        </section>
      )}
    </div>
  );
}

function Workspace(props: { session: Session; activeTask: Task | null; latestAttempt: Attempt | null; flashFeedback: { feedback: Feedback; passed: boolean } | null; draft: string; setDraft: (x: string) => void; busy: boolean; error: string; chat: string; setChat: (x: string) => void; hint: Json | null; showExample: boolean; setShowExample: (x: boolean) => void; submit: () => Promise<void>; sendChat: () => Promise<void>; unlockHint: () => Promise<void>; close: () => void }) {
  const { session, activeTask } = props;
  const [ritualDoneFor, setRitualDoneFor] = useState<string | null>(null);
  // 批改常需 10–30 秒：超过 30 秒追加一句安抚，避免孩子以为卡死
  const [slowWait, setSlowWait] = useState(false);
  const [wasBusy, setWasBusy] = useState(false);
  if (props.busy !== wasBusy) {
    // 渲染期间同步派生状态（React 推荐写法）：busy 结束时立刻收起安抚文案
    setWasBusy(props.busy);
    if (!props.busy) setSlowWait(false);
  }
  useEffect(() => {
    if (!props.busy) return;
    const timer = setTimeout(() => setSlowWait(true), 30000);
    return () => clearTimeout(timer);
  }, [props.busy]);
  const isImitation = !!activeTask && session.mode === "imitation" && (activeTask.prompt.model?.sentences.length ?? 0) > 0;
  const ritualPending = isImitation && ritualDoneFor !== activeTask!.id;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-[2rem] bg-white p-5 shadow sm:p-7">
      <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-accent">{session.kind === "review" ? "错点复练" : "当前练习"}</div><h2 className="mt-1 text-2xl font-black">{session.title}</h2></div><button onClick={props.close} className="text-sm text-black/40 underline">返回</button></div>
      {session.mode === "translation" && session.tasks.length === 0 ? <div className="mt-6"><div className="flex max-h-96 flex-col gap-3 overflow-y-auto">{session.messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-foreground text-white" : "bg-black/[.04]"}`}>{message.content}</div>)}</div><div className="mt-4 flex gap-2"><textarea value={props.chat} onChange={(e) => props.setChat(e.target.value)} maxLength={1000} rows={3} placeholder="用中文说说你的想法…" className="min-w-0 flex-1 rounded-xl border border-black/10 p-3" /><button disabled={props.busy || !props.chat.trim()} onClick={props.sendChat} className="rounded-xl bg-foreground px-5 font-bold text-white disabled:opacity-40">发送</button></div></div> : activeTask ? <div className="mt-6">
        <div className="rounded-2xl bg-background p-5"><div className="text-sm font-bold text-accent">第 {activeTask.orderIndex + 1} 题</div><p className="mt-2 text-lg font-bold leading-8">{activeTask.prompt.instruction}</p>{activeTask.prompt.chinese && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-4">{activeTask.prompt.chinese}</div>}{ritualPending ? (
          <ImitationRitual key={activeTask.id} prompt={activeTask.prompt} onDone={() => setRitualDoneFor(activeTask.id)} />
        ) : (
          <>
            <TeachingScaffold key={activeTask.id} prompt={isImitation ? { ...activeTask.prompt, model: undefined, example: undefined } : activeTask.prompt} showExample={props.showExample} setShowExample={props.setShowExample} />
            {isImitation && <button type="button" onClick={() => setRitualDoneFor(null)} className="mt-3 text-sm font-bold text-black/40 underline underline-offset-4">回到示范，再走一遍</button>}
          </>
        )}</div>
        {!ritualPending && (
        <>
        {props.flashFeedback ? <FeedbackCard feedback={props.flashFeedback.feedback} passed={props.flashFeedback.passed} /> : props.latestAttempt && <FeedbackCard feedback={props.latestAttempt.feedback} passed={props.latestAttempt.passed} />}
        {activeTask.attempts.length > 1 && (
          <div className="mt-5">
            <div className="text-sm font-bold text-black/45">前几轮</div>
            <div className="mt-2 flex flex-col gap-2">
              {activeTask.attempts.slice(0, -1).map((attempt) => (
                <details key={attempt.id} className="rounded-xl border border-black/8 bg-background p-3">
                  <summary className="cursor-pointer text-sm font-bold">第 {attempt.version} 轮{attempt.passed ? " · 已过关" : " · 未过关"}<span className="ml-2 font-normal text-black/40">原文与批改</span></summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-7">{attempt.text}</p>
                  <FeedbackCard feedback={attempt.feedback} passed={attempt.passed} />
                </details>
              ))}
            </div>
          </div>
        )}
        {props.hint && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm"><div className="font-bold text-blue-700">本级帮助</div><pre className="mt-2 whitespace-pre-wrap font-sans text-blue-900">{Object.entries(props.hint).map(([key, value]) => `${key === "keywords" ? "关键词" : key === "frame" ? "句型骨架" : key === "modelAnswer" ? "示范" : "分步重建"}：${Array.isArray(value) ? value.join(" · ") : String(value)}`).join("\n")}</pre>{"modelAnswer" in props.hint && <button onClick={() => props.setShowExample(false)} className="mt-2 font-bold underline">隐藏示范，开始回忆重写</button>}</div>}
        <textarea value={props.draft} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (!props.busy && props.draft.trim()) void props.submit(); } }} onChange={(e) => props.setDraft(e.target.value)} maxLength={5000} rows={activeTask.type === "article" ? 10 : 5} placeholder="在这里写英文…" className="mt-5 w-full rounded-2xl border border-black/10 p-4 text-lg leading-8 outline-none focus:ring-2 focus:ring-accent" />
        <div className="mt-3 flex flex-wrap gap-3"><button disabled={props.busy || !props.draft.trim()} onClick={props.submit} className={`rounded-xl bg-foreground px-6 py-3 font-bold text-white disabled:opacity-40 ${props.busy ? "animate-pulse" : ""}`}>{props.busy ? "AI 老师批改中…" : activeTask.attempts.length ? "提交改写 ⌘⏎" : "提交批改 ⌘⏎"}</button><button disabled={props.busy} onClick={props.unlockHint} className="rounded-xl border border-black/10 px-5 py-3 text-sm font-bold disabled:opacity-35">{activeTask.hintLevel === 0 ? "给我关键词" : activeTask.hintLevel === 1 ? "给我句型骨架" : "给我示范并分步重建"}</button></div>
        {props.busy && slowWait && <p className="mt-2 animate-pulse text-sm text-black/45">好文章值得多改一会儿，AI 老师还在仔细看…</p>}
        {props.error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{props.error}</div>}
        </>
        )}
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
