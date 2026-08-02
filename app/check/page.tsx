"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { playAudio, playDing, playBuzz, postProgress, preloadAudio } from "@/lib/client";
import FitWord from "@/components/FitWord";
import { DEFAULT_APPEARANCE, type LearnAppearance } from "@/lib/appearance";
import { buildReviewTasks, type ReviewTask } from "@/lib/review-tasks";

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
}

type QuizMode = "spell" | "choice";

// 一道检查题：强检查时每个词拆成拼写、选择两题，再在整场队列中交错打散。
type Task = ReviewTask<QuizWord>;

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
  const [tasks, setTasks] = useState<Task[]>([]); // 本轮打散后的题目队列
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
  const [round, setRound] = useState(1); // 复习循环轮次：未通过的词进入下一轮
  const failedRef = useRef<Set<string>>(new Set()); // 本轮未通过（答错/放弃过）的词
  const lapsedRef = useRef<Set<string>>(new Set()); // 整场复习中曾失败的词，纠正后也不升级

  // 拼写题状态
  const [input, setInput] = useState("");
  const [spellState, setSpellState] = useState<"idle" | "correct" | "wrong">("idle");
  const [showAnswer, setShowAnswer] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 选择题状态
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [choiceAnswered, setChoiceAnswered] = useState(false);

  const task = tasks[idx];
  const word = task?.word;
  const mode = task?.mode ?? quizMode ?? "spell";

  // 开启一轮检查：打散题目、重置进度与未通过记录
  const startRound = useCallback(
    (ws: QuizWord[], isStrict: boolean, m: QuizMode) => {
      setWords(ws);
      setTasks(buildReviewTasks(ws, isStrict, m));
      setIdx(0);
      failedRef.current = new Set();
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
    const seed = `${w.id}:${round}:${idx}`;
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
  }, [task, distractors, round, idx]);

  useEffect(() => {
    if (mode === "spell") inputRef.current?.focus();
  }, [mode, idx]);

  const markFailed = useCallback((wordId: string) => {
    failedRef.current.add(wordId);
    lapsedRef.current.add(wordId);
  }, []);

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
    // 本轮结束
    if (isReview) {
      // 复习：未通过的词循环再来一轮，直到全部通过
      const failed = failedRef.current;
      if (failed.size > 0) {
        const retryWords = words.filter((w) => failed.has(w.id));
        setRound((r) => r + 1);
        startRound(retryWords, strict, quizMode ?? "spell");
        return;
      }
      // 全部通过，重新拉取确认门禁已清
      const r = await fetch("/api/session");
      const d = await r.json();
      if (d.reviewsCleared) {
        setReviewCleared(true);
      } else {
        // 保底：仍有到期词（如之前跳过累积下来的），继续新一轮
        setRound((r2) => r2 + 1);
        startRound(d.reviews, strict, quizMode ?? "spell");
        return;
      }
      return;
    }
    setFinished(true);
  }, [idx, tasks.length, isReview, words, strict, quizMode, startRound]);

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
      await postProgress(word.id, "check-spell", "correct", { hadFailure: lapsedRef.current.has(word.id) });
      setTimeout(next, 700);
    } else {
      playBuzz();
      setSpellState("wrong");
      setShake((s) => s + 1);
      markFailed(word.id);
      await postProgress(word.id, "check-spell", "wrong");
    }
  }

  // 想不起来：两种题型都可直接揭晓答案，并按未通过记录。
  async function giveUp() {
    if (!word || showAnswer || spellState === "correct" || choiceAnswered) return;
    setShowAnswer(true);
    setChoiceAnswered(mode === "choice");
    markFailed(word.id);
    await postProgress(word.id, mode === "spell" ? "check-spell" : "check-choice", "giveup");
  }

  // 选择题点击
  async function pick(opt: string) {
    if (!word || showAnswer || choiceAnswered) return;
    if (opt === word.meaningCn) {
      setChoiceAnswered(true);
      playDing();
      await postProgress(word.id, "check-choice", "correct", { hadFailure: lapsedRef.current.has(word.id) });
      setTimeout(next, 500);
    } else {
      playBuzz();
      setWrongPicks((p) => [...p, opt]);
      markFailed(word.id);
      await postProgress(word.id, "check-choice", "wrong");
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
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-bold text-xl mb-2">今日复习全部通过！</h2>
          <p className="text-black/60 mb-6">新词学习已解锁。</p>
          <Link href="/learn" className="inline-block bg-blue-500 text-white rounded-xl px-8 py-3 font-bold hover:opacity-90">
            开始背新词 →
          </Link>
        </div>
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
          {strict ? `强检查 ${mode === "spell" ? "拼写" : "选择"}` : mode === "spell" ? "拼写" : "选择"}
          {isReview && round > 1 && <span className="text-orange-500"> · 第 {round} 轮（未通过循环复习）</span>}
        </span>
        <span>{idx + 1} / {tasks.length}</span>
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
    </div>
  );
}
