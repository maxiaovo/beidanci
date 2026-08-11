"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { playAudio, playDing, playBuzz, postProgress, preloadAudio } from "@/lib/client";
import FitWord from "@/components/FitWord";
import { DEFAULT_APPEARANCE, type LearnAppearance } from "@/lib/appearance";
import { buildReviewTasks, insertAtRandomSpot, type ReviewTask } from "@/lib/review-tasks";
import { initialRecovery, onCorrect, onWrong, type WordRecovery } from "@/lib/review-recovery";

interface QuizWord {
  id: string;
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  audioWord?: string | null;
  bookId?: string;
  bookName?: string;
  unitTitle?: string;
  // 强检查复习时服务端下发的题型通过标志：已通过的题型不再出题
  spellPassed?: boolean;
  choicePassed?: boolean;
}

type QuizMode = "spell" | "choice";

// 学习报告视图（与 lib/study-report.ts 的 serializeReport 对应）
interface ReportView {
  id: string;
  status: string; // generating | done | failed
  step: string; // collect | narrate | tts | done
  error: string;
  content: string;
  hasAudio: boolean;
}

// 报告生成阶段（用于进度展示；后端 step 字段与 key 对应）
const REPORT_STEPS = [
  { key: "collect", label: "汇总错词" },
  { key: "narrate", label: "AI 分析错因" },
  { key: "tts", label: "合成语音" },
];

// 一道检查题：强检查时每个词拆成拼写、选择两题，再在整场队列中交错打散。
// recovery：补考题标记（答错后在本轮后面重插的题）；
// recoveryPassed/recoveryRequired：补考累计答对进度（家长设置的补考次数 > 1 时展示）
type Task = ReviewTask<QuizWord> & { recovery?: boolean; recoveryPassed?: number; recoveryRequired?: number };

export function RecallActions({
  revealed,
  mode = "spell",
  word,
  meaningCn,
  phonetic,
  canReveal = true,
  onReveal,
  onNext,
}: {
  revealed: boolean;
  mode?: QuizMode;
  word: string;
  meaningCn?: string;
  phonetic: string;
  canReveal?: boolean;
  onReveal: () => void;
  onNext: () => void;
}) {
  if (revealed) {
    const answer = mode === "choice" ? meaningCn : word;
    const detail = mode === "choice" ? `${word} ${phonetic}`.trim() : phonetic;

    return (
      <div className="text-center flex flex-col items-center gap-3">
        <div className="font-bold text-blue-600 max-w-full">
          <FitWord text={answer ?? word} sizePx={36} />
        </div>
        {detail && <div className="text-black/40">{detail}</div>}
        <button
          type="button"
          onClick={onNext}
          className="mt-2 bg-foreground text-white rounded-xl px-8 py-2.5 font-bold"
          autoFocus
        >
          下一个 →
        </button>
      </div>
    );
  }

  if (!canReveal) return null;

  return (
    <button
      type="button"
      onClick={onReveal}
      className="text-sm text-black/45 underline underline-offset-4 hover:text-orange-600"
    >
      想不起来，查看答案
    </button>
  );
}

export default function CheckPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-black/40">加载中…</div>}>
      <CheckInner />
    </Suspense>
  );
}

function CheckInner() {
  const params = useSearchParams();
  const isReview = params.get("mode") === "review";
  const router = useRouter();

  const [words, setWords] = useState<QuizWord[]>([]); // 本轮要检查的词
  const [tasks, setTasks] = useState<Task[]>([]); // 打散后的题目队列（答错会随机重插补考题，长度动态增长）
  const [distractors, setDistractors] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode | null>(null); // 非强检查的本轮模式
  const [strict, setStrict] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewCleared, setReviewCleared] = useState(false);
  const [skipped, setSkipped] = useState(false); // 用户强行跳过了本次复习
  const [allowSkip, setAllowSkip] = useState(false);
  const [appearance, setAppearance] = useState<LearnAppearance>(DEFAULT_APPEARANCE); // 全局外观（卡片宽度等）
  const recoveryRef = useRef<Map<string, WordRecovery>>(new Map()); // 复习模式：每词的补考状态
  const lapsedRef = useRef<Set<string>>(new Set()); // 自由练习：曾失败的词，纠正后也不升级
  const [initialTotal, setInitialTotal] = useState(0); // 本轮初始题数（进度条分母，不随补考增长）
  // 复习补考设置（家长端配置）：补考需累计答对次数、循环补考（补考中再错清零重计）
  const [recoveryTarget, setRecoveryTarget] = useState(1);
  const [cyclicRecovery, setCyclicRecovery] = useState(false);

  // 非阻断轻提示（几秒自动消失）：保存失败提醒、补考熔断提示等
  const [toast, setToast] = useState("");
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 4000);
  }, []);

  // 统一上报学习结果：
  // - 自由练习自动带 practice=true（服务端只记日志不动 SRS 调度）
  // - 每次带上会话开始时读取的 strict 快照（服务端优先用它，防管理员中途改开关导致两侧状态机分裂）
  // - 返回 false（保存失败）时轻提示，不阻断答题流程
  const reportProgress = useCallback(
    async (
      wordId: string,
      progressMode: string,
      result: "correct" | "wrong" | "giveup" | "defer",
      options: { hadFailure?: boolean; recoveryPass?: boolean; attempt?: string } = {},
    ) => {
      const ok = await postProgress(wordId, progressMode, result, { practice: !isReview, strict, ...options });
      if (!ok) showToast("记录未保存，请检查网络");
      return ok;
    },
    [isReview, strict, showToast],
  );

  // 拼写题状态
  const [input, setInput] = useState("");
  const [spellState, setSpellState] = useState<"idle" | "correct" | "wrong">("idle");
  const [showAnswer, setShowAnswer] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 选择题状态
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [choiceAnswered, setChoiceAnswered] = useState(false);

  // 学习报告（复习通过后生成）
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportView | null>(null);
  const [reportErr, setReportErr] = useState("");

  // 轮询报告生成进度（后端异步生成：collect → narrate → tts → done/failed）
  useEffect(() => {
    if (!reportId) return;
    let stopped = false;
    const tick = async (timer: number) => {
      if (stopped) return;
      try {
        const r = await fetch(`/api/reports/${reportId}`);
        if (!r.ok || stopped) return;
        const d = (await r.json()) as ReportView;
        setReport(d);
        if (d.status !== "generating") {
          stopped = true;
          window.clearInterval(timer);
        }
      } catch {
        // 网络抖动，下轮再试
      }
    };
    const timer = window.setInterval(() => void tick(timer), 2000);
    void tick(timer);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [reportId]);

  async function startReport() {
    setReportErr("");
    setReport(null);
    const r = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ range: "today" }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setReportErr(d.error || "生成失败，请稍后再试");
      return;
    }
    setReportId(d.id);
  }

  const task = tasks[idx];
  const word = task?.word;
  const mode = task?.mode ?? quizMode ?? "spell";
  // 进度展示：分母固定为本轮初始题数；补考题单独计数（剩余队列中带补考标记的题）
  const total = initialTotal || tasks.length;
  const recoveryLeft = tasks.slice(idx).filter((t) => t.recovery).length;

  // 开启一轮检查：打散题目、重置进度与补考记录
  const startRound = useCallback(
    (ws: QuizWord[], isStrict: boolean, m: QuizMode) => {
      setWords(ws);
      const built = buildReviewTasks(ws, isStrict, m);
      setInitialTotal(built.length);
      setTasks(built);
      setIdx(0);
      recoveryRef.current = new Map();
      // 重置题目状态，避免上一轮的残留带到新一轮
      setInput("");
      setSpellState("idle");
      setShowAnswer(false);
      setWrongPicks([]);
      setChoiceAnswered(false);
      preloadAudio(ws.map((w) => w.audioWord));
    },
    [],
  );

  const load = useCallback(async () => {
    // 站点配置（强检查开关、全局外观）
    const c = await fetch("/api/config");
    const cfg = c.ok ? await c.json() : {};
    const isStrict = !!cfg.strictCheck;
    setStrict(isStrict);
    setAppearance({ ...DEFAULT_APPEARANCE, ...(cfg.appearance ?? {}) });

    if (isReview) {
      const r = await fetch("/api/session");
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.replace("/parent"); // 家长无学习权限
      const d = await r.json();
      setAllowSkip(!!d.stats.allowSkipReview);
      setRecoveryTarget(Math.max(1, d.stats.recoveryCorrectTarget ?? 1));
      setCyclicRecovery(!!d.stats.cyclicRecovery);
      if (d.reviewsCleared) {
        setReviewCleared(true);
      } else {
        const m = d.stats.defaultCheckMode as QuizMode;
        setQuizMode(m);
        startRound(d.reviews, isStrict, m);
        // 选择题干扰项
        const p = await fetch("/api/practice");
        if (p.ok) {
          const pd = await p.json();
          setDistractors(pd.distractors);
        }
      }
    } else {
      const r = await fetch("/api/practice");
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.replace("/parent"); // 家长无学习权限
      const d = await r.json();
      setWords(d.words);
      setDistractors(d.distractors);
      // 强检查：跳过模式选择，直接开始（拼写、选择两轮打散）
      if (isStrict) {
        setQuizMode("spell");
        startRound(d.words, true, "spell");
      } else {
        preloadAudio(d.words.map((w: QuizWord) => w.audioWord));
      }
    }
    setLoaded(true);
  }, [isReview, router, startRound]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // 选项完全由当前题目和干扰项推导，不额外维护一份可能失步的状态。
  const options = useMemo(() => {
    if (!task || task.mode !== "choice") return [];
    const w = task.word;
    const seed = `${w.id}:${idx}`;
    const rank = (value: string) => {
      let hash = 2166136261;
      for (const char of `${seed}:${value}`) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const pool = [...new Set(distractors.filter((m) => m && m !== w.meaningCn))];
    const picks = pool.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
    return [...picks, w.meaningCn].sort((a, b) => rank(`answer:${a}`) - rank(`answer:${b}`));
  }, [task, distractors, idx]);

  useEffect(() => {
    if (mode === "spell") inputRef.current?.focus();
  }, [mode, idx]);

  // 复习模式：答错/放弃 → 该题型需补考累计答对 recoveryTarget 次（循环补考下已累计次数清零），
  // 补考题随机重插进剩余队列；同一词连续失败达到熔断上限后移出本场（上报 defer 推到明日再复习）
  const applyRecoveryWrong = useCallback(
    async (w: QuizWord, m: QuizMode) => {
      const state =
        recoveryRef.current.get(w.id) ??
        initialRecovery(strict, quizMode ?? "spell", { spell: w.spellPassed, choice: w.choicePassed });
      const { next: nextState, requeue, tripped } = onWrong(state, m, strict, recoveryTarget, cyclicRecovery);
      recoveryRef.current.set(w.id, nextState);
      if (tripped) {
        // 熔断：该词移出本场队列，推到明日 0 点再复习（不动 stage，lapses+1）
        const ok = await reportProgress(w.id, m === "spell" ? "check-spell" : "check-choice", "defer");
        if (ok) showToast("这个词今天先到这里，明天再练");
        return;
      }
      setTasks((prev) =>
        requeue.reduce(
          (acc, tm) =>
            insertAtRandomSpot(
              acc,
              {
                word: w,
                mode: tm,
                recovery: true,
                recoveryPassed: nextState[tm].passed,
                recoveryRequired: nextState[tm].required,
              },
              idx,
            ),
          prev,
        ),
      );
    },
    [strict, quizMode, idx, recoveryTarget, cyclicRecovery, reportProgress, showToast],
  );

  // 复习模式：答对 → 累计补考答对次数；中间次只留记录不晋级（recoveryPass），
  // 凑满次数或一次过时按普通 correct 上报晋级
  const reportReviewCorrect = useCallback(
    async (w: QuizWord, m: QuizMode) => {
      const state =
        recoveryRef.current.get(w.id) ??
        initialRecovery(strict, quizMode ?? "spell", { spell: w.spellPassed, choice: w.choicePassed });
      const { next: nextState, report } = onCorrect(state, m);
      recoveryRef.current.set(w.id, nextState);
      const progressMode = m === "spell" ? "check-spell" : "check-choice";
      if (report === "recoveryPass") {
        await reportProgress(w.id, progressMode, "correct", { recoveryPass: true });
        setTasks((prev) =>
          insertAtRandomSpot(
            prev,
            {
              word: w,
              mode: m,
              recovery: true,
              recoveryPassed: nextState[m].passed,
              recoveryRequired: nextState[m].required,
            },
            idx,
          ),
        );
      } else {
        await reportProgress(w.id, progressMode, "correct");
      }
    },
    [strict, quizMode, idx, reportProgress],
  );

  const next = useCallback(async () => {
    if (idx + 1 < tasks.length) {
      setIdx(idx + 1);
      setInput("");
      setSpellState("idle");
      setShowAnswer(false);
      setWrongPicks([]);
      setChoiceAnswered(false);
      return;
    }
    // 本轮结束（答错的词已在本轮内补考通过，不存在遗留失败词）
    if (isReview) {
      // 重新拉取确认门禁已清
      const r = await fetch("/api/session");
      const d = await r.json();
      if (d.reviewsCleared) {
        setReviewCleared(true);
      } else {
        // 保底：仍有到期词（如之前跳过累积下来的），继续新一轮
        startRound(d.reviews, strict, quizMode ?? "spell");
      }
      return;
    }
    setFinished(true);
  }, [idx, tasks.length, isReview, strict, quizMode, startRound]);

  // 跳过复习：留痕（家长会看到），未复习的词仍会累积到下次复习
  async function skipReview() {
    const r = await fetch("/api/skip-review", { method: "POST" });
    if (r.ok) setSkipped(true);
  }

  // 拼写提交
  async function submitSpell() {
    if (!word || spellState === "correct" || showAnswer) return;
    const answer = input.trim().toLowerCase();
    if (!answer) return;
    if (answer === word.text.toLowerCase()) {
      playDing();
      setSpellState("correct");
      if (isReview) await reportReviewCorrect(word, "spell");
      else await reportProgress(word.id, "check-spell", "correct", { hadFailure: lapsedRef.current.has(word.id) });
      setTimeout(next, 700);
    } else {
      playBuzz();
      setSpellState("wrong");
      setShake((s) => s + 1);
      await reportProgress(word.id, "check-spell", "wrong", { attempt: answer });
      if (isReview) await applyRecoveryWrong(word, "spell");
      else lapsedRef.current.add(word.id);
      // 答错不允许原地重打：展示答案，点"下一个"继续
      setShowAnswer(true);
    }
  }

  // 想不起来：两种题型都可直接揭晓答案，并按答错处理（复习模式同样触发补考重插）。
  // 拼写题把当前已输入的内容一并留作 attempt，供学习报告分析错因
  async function giveUp() {
    if (!word || showAnswer || spellState === "correct" || choiceAnswered) return;
    setShowAnswer(true);
    setChoiceAnswered(mode === "choice");
    const attempt = mode === "spell" ? input.trim().toLowerCase() : "";
    await reportProgress(
      word.id,
      mode === "spell" ? "check-spell" : "check-choice",
      "giveup",
      attempt ? { attempt } : {},
    );
    if (isReview) await applyRecoveryWrong(word, mode);
    else lapsedRef.current.add(word.id);
  }

  // 选择题点击
  async function pick(opt: string) {
    if (!word || showAnswer || choiceAnswered) return;
    if (opt === word.meaningCn) {
      setChoiceAnswered(true);
      playDing();
      if (isReview) await reportReviewCorrect(word, "choice");
      else await reportProgress(word.id, "check-choice", "correct", { hadFailure: lapsedRef.current.has(word.id) });
      setTimeout(next, 500);
    } else {
      playBuzz();
      setWrongPicks((p) => [...p, opt]);
      await reportProgress(word.id, "check-choice", "wrong");
      if (isReview) await applyRecoveryWrong(word, "choice");
      else lapsedRef.current.add(word.id);
      // 答错即揭示答案并进入下一题（补考已随机重插）
      setChoiceAnswered(true);
      setShowAnswer(true);
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  if (skipped) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">⏭️</div>
          <h2 className="font-bold text-xl mb-2">已跳过本次复习</h2>
          <p className="text-black/60 mb-2">这次跳过会记录在家长后台。</p>
          <p className="text-orange-500/90 text-sm mb-6">未复习的单词不会消失，会累积到下次复习环节，记得补上哦。</p>
          <Link href="/learn" className="inline-block bg-blue-500 text-white rounded-xl px-8 py-3 font-bold hover:opacity-90">
            先去背新词 →
          </Link>
        </div>
      </div>
    );
  }

  if (reviewCleared) {
    const stepIndex = report ? REPORT_STEPS.findIndex((s) => s.key === report.step) : 0;
    const progressPct =
      report?.status === "done" ? 100 : Math.max(12, ((Math.max(stepIndex, 0) + 1) / REPORT_STEPS.length) * 100);
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md w-full">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-bold text-xl mb-2">今日复习全部通过！</h2>
          <p className="text-black/60 mb-6">新词学习已解锁。</p>
          <Link href="/learn" className="inline-block bg-blue-500 text-white rounded-xl px-8 py-3 font-bold hover:opacity-90">
            开始背新词 →
          </Link>

          <div className="mt-8 border-t border-black/5 pt-6">
            {!reportId && (
              <>
                <button
                  onClick={startReport}
                  className="bg-white border border-accent text-foreground rounded-xl px-6 py-2.5 font-bold hover:bg-accent/20"
                >
                  📋 生成学习报告
                </button>
                <p className="text-xs text-black/40 mt-2">
                  AI 分析今天拼错的单词，生成错因精讲和语音讲解（每天最多 2 次）
                </p>
              </>
            )}

            {reportId && (!report || report.status === "generating") && (
              <div className="text-left">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-bold">
                    正在生成学习报告…{report ? REPORT_STEPS[Math.max(stepIndex, 0)]?.label ?? "" : "汇总错词"}
                  </span>
                  <span className="text-black/40 text-xs">请稍候</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-black/35 mt-2">
                  {REPORT_STEPS.map((s, i) => (
                    <span key={s.key} className={i <= stepIndex ? "text-accent font-bold" : ""}>
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {report?.status === "done" && (
              <div className="text-left">
                <h3 className="font-bold mb-3 text-center">📋 今日学习报告</h3>
                {report.hasAudio && (
                  <audio controls src={`/api/reports/${report.id}/audio`} className="w-full mb-3" />
                )}
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-black/70 max-h-72 overflow-y-auto bg-black/[.02] rounded-xl p-4">
                  {report.content}
                </div>
                {report.error && <p className="text-xs text-orange-500 mt-2">{report.error}</p>}
              </div>
            )}

            {report?.status === "failed" && (
              <div>
                <p className="text-sm text-red-500 mb-3">{report.error || "生成失败"}</p>
                <button
                  onClick={() => {
                    setReportId(null);
                    setReport(null);
                  }}
                  className="text-sm text-black/50 underline hover:text-orange-500"
                >
                  返回重试
                </button>
              </div>
            )}

            {reportErr && <p className="text-sm text-red-500 mt-3">{reportErr}</p>}
          </div>
        </div>
      </div>
    );
  }

  // 自由练习：没词时直接展示空态，不让用户先选模式
  if (!isReview && words.length === 0) {
    return (
      <div className="p-10 text-center text-black/40">
        暂无可练习的单词，先去 <Link href="/learn" className="text-blue-500 underline">背单词</Link> 吧
      </div>
    );
  }

  // 自由练习的模式选择
  if (!isReview && quizMode === null) {
    return (
      <div className="page-shell min-h-[70vh] flex flex-col justify-center">
        <div className="mb-8 max-w-2xl">
          <div className="text-sm font-bold uppercase tracking-[0.16em] text-black/35">额外练习</div>
          <h1 className="mt-2 text-3xl font-black">选择一种训练方式</h1>
          <p className="mt-3 leading-7 text-black/50">这里用于自主加练，不影响首页推荐的今日学习顺序。</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <button
            onClick={() => {
              setQuizMode("spell");
              startRound(words, false, "spell");
            }}
            className="min-h-64 rounded-3xl border border-black/6 bg-white p-10 text-left shadow-lg transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
          >
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-black/35">主动回忆 · 难度较高</div>
            <div className="mt-8 text-2xl font-black">拼写检查</div>
            <div className="mt-3 text-base leading-7 text-black/50">只看中文意思，从记忆中完整拼出英文单词。</div>
            <div className="mt-8 font-bold text-foreground">开始拼写 →</div>
          </button>
          <button
            onClick={() => {
              setQuizMode("choice");
              startRound(words, false, "choice");
            }}
            className="min-h-64 rounded-3xl border border-black/6 bg-white p-10 text-left shadow-lg transition hover:-translate-y-1 hover:border-accent/40 hover:shadow-xl"
          >
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-black/35">快速辨认 · 难度较低</div>
            <div className="mt-8 text-2xl font-black">选择检查</div>
            <div className="mt-3 text-base leading-7 text-black/50">看到英文单词，从四个选项中辨认正确释义。</div>
            <div className="mt-8 font-bold text-foreground">开始选择 →</div>
          </button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="font-bold text-xl mb-6">本轮练习完成！</h2>
          <Link href="/" className="inline-block bg-foreground text-white rounded-xl px-8 py-3 font-bold">
            回到首页
          </Link>
        </div>
      </div>
    );
  }

  if (!word) {
    return (
      <div className="p-10 text-center text-black/40">
        暂无可练习的单词，先去 <Link href="/learn" className="text-blue-500 underline">背单词</Link> 吧
      </div>
    );
  }

  return (
    <div
      className="mx-auto p-4 sm:p-6 flex flex-col items-center gap-6"
      style={{ width: `${appearance.cardWidthPct}%`, maxWidth: "1440px" }}
    >
      <div className="w-full flex items-center justify-between text-sm text-black/50">
        <span>
          {isReview ? "📅 复习检查" : "💪 自由练习"} ·{" "}
          {strict ? `双重检查 ${mode === "spell" ? "拼写" : "选择"}` : mode === "spell" ? "拼写" : "选择"}
          {task?.recovery && (
            <span className="text-orange-500">
              {" · 补考"}
              {task.recoveryRequired !== undefined &&
                task.recoveryRequired > 1 &&
                ` · 已补对 ${task.recoveryPassed ?? 0}/${task.recoveryRequired}`}
            </span>
          )}
        </span>
        <span>
          {Math.min(idx + 1, total)} / {total}
          {recoveryLeft > 0 && <span className="text-orange-500"> · 补考剩 {recoveryLeft} 题</span>}
        </span>
      </div>

      <div
        key={`${word.id}-${mode}-${shake}`}
        className={`w-full bg-white rounded-3xl shadow-lg p-6 sm:p-10 flex flex-col items-center justify-center gap-8 ${shake > 0 && spellState === "wrong" ? "animate-shake" : ""}`}
        style={{ minHeight: `${Math.round(appearance.wordSizePx * 4.3)}px` }}
      >
        {mode === "spell" ? (
          <>
            <div className="text-center">
              <div className="text-black/40 text-sm mb-2">{word.pos}</div>
              <div className="text-3xl sm:text-4xl font-bold">{word.meaningCn}</div>
            </div>
            {!showAnswer && (
              <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setSpellState("idle");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submitSpell()}
                  placeholder="输入单词后按回车"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`w-full text-center text-3xl font-bold border-b-4 outline-none py-2 bg-transparent transition-colors ${
                    spellState === "correct"
                      ? "text-green-500 border-green-400"
                      : spellState === "wrong"
                        ? "text-red-500 border-red-400"
                        : "border-black/15 focus:border-accent"
                  }`}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-center flex items-center justify-center gap-3 w-full">
              <button
                onClick={() => playAudio(word.audioWord ?? null)}
                className="font-bold hover:opacity-70 cursor-pointer max-w-full"
              >
                <FitWord text={word.text} sizePx={48} />
              </button>
            </div>
            <div className="text-black/40">{word.phonetic}</div>
            {!showAnswer && (
              <div className="grid grid-cols-1 gap-3 w-full max-w-md">
                {options.map((opt) => {
                  const isWrong = wrongPicks.includes(opt);
                  return (
                    <button
                      key={opt}
                      disabled={isWrong || choiceAnswered}
                      onClick={() => pick(opt)}
                      className={`rounded-xl border px-4 py-3 text-lg transition-colors ${
                        isWrong
                          ? "border-red-300 text-red-400 bg-red-50 line-through"
                          : "border-black/10 hover:border-accent hover:bg-accent/20"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <RecallActions
          revealed={showAnswer}
          mode={mode}
          word={word.text}
          meaningCn={word.meaningCn}
          phonetic={word.phonetic}
          canReveal={spellState !== "correct" && !choiceAnswered}
          onReveal={giveUp}
          onNext={next}
        />
      </div>

      {isReview && allowSkip && (
        <button
          onClick={skipReview}
          className="text-sm text-black/40 underline hover:text-orange-500"
        >
          跳过本次复习（家长会看到记录，未复习的词会累积到下次）
        </button>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 text-white text-sm rounded-xl px-5 py-2.5 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
