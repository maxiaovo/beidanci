"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { playAudio, playDing, playBuzz, postProgress, preloadAudio } from "@/lib/client";

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

// 一道检查题：某个词的一种检查方式。强检查时每个词拆成拼写、选择两道题，
// 两轮分别随机排序，保证同一个词的两次检查不会挨在一起。
interface Task {
  word: QuizWord;
  mode: QuizMode;
}

const shuffle = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

function buildTasks(ws: QuizWord[], strict: boolean, mode: QuizMode): Task[] {
  if (strict) {
    return [
      ...shuffle(ws).map((word) => ({ word, mode: "spell" as const })),
      ...shuffle(ws).map((word) => ({ word, mode: "choice" as const })),
    ];
  }
  return shuffle(ws).map((word) => ({ word, mode }));
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
  const [round, setRound] = useState(1); // 复习循环轮次：未通过的词进入下一轮
  const failedRef = useRef<Set<string>>(new Set()); // 本轮未通过（答错/放弃过）的词

  // 拼写题状态
  const [input, setInput] = useState("");
  const [spellState, setSpellState] = useState<"idle" | "correct" | "wrong">("idle");
  const [showAnswer, setShowAnswer] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 选择题状态
  const [options, setOptions] = useState<string[]>([]);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);

  const task = tasks[idx];
  const word = task?.word;
  const mode = task?.mode ?? quizMode ?? "spell";

  // 开启一轮检查：打散题目、重置进度与未通过记录
  const startRound = useCallback(
    (ws: QuizWord[], isStrict: boolean, m: QuizMode) => {
      setWords(ws);
      setTasks(buildTasks(ws, isStrict, m));
      setIdx(0);
      failedRef.current = new Set();
      // 重置题目状态，避免上一轮的残留带到新一轮
      setInput("");
      setSpellState("idle");
      setShowAnswer(false);
      setWrongPicks([]);
      preloadAudio(ws.map((w) => w.audioWord));
    },
    [],
  );

  const load = useCallback(async () => {
    // 站点配置（强检查开关）
    const c = await fetch("/api/config");
    const isStrict = c.ok ? !!(await c.json()).strictCheck : false;
    setStrict(isStrict);

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
    load();
  }, [load]);

  // 生成选择题选项（依赖整个 task：新一轮重建 tasks，引用变化会触发重新生成）
  useEffect(() => {
    if (!task || task.mode !== "choice") return;
    const w = task.word;
    const pool = distractors.filter((m) => m && m !== w.meaningCn);
    const picks = new Set<string>();
    while (picks.size < 3 && picks.size < pool.length) {
      picks.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    const all = [...picks, w.meaningCn].sort(() => Math.random() - 0.5);
    setOptions(all);
    setWrongPicks([]);
  }, [task, distractors]);

  useEffect(() => {
    if (mode === "spell") inputRef.current?.focus();
  }, [mode, idx]);

  const markFailed = useCallback((wordId: string) => {
    failedRef.current.add(wordId);
  }, []);

  const next = useCallback(async () => {
    if (idx + 1 < tasks.length) {
      setIdx(idx + 1);
      setInput("");
      setSpellState("idle");
      setShowAnswer(false);
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
      await postProgress(word.id, "check-spell", "correct");
      setTimeout(next, 700);
    } else {
      playBuzz();
      setSpellState("wrong");
      setShake((s) => s + 1);
      markFailed(word.id);
      await postProgress(word.id, "check-spell", "wrong");
    }
  }

  // 放弃
  async function giveUp() {
    if (!word) return;
    setShowAnswer(true);
    markFailed(word.id);
    await postProgress(word.id, "check-spell", "giveup");
  }

  // 选择题点击
  async function pick(opt: string) {
    if (!word) return;
    if (opt === word.meaningCn) {
      playDing();
      await postProgress(word.id, "check-choice", "correct");
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
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex flex-col sm:flex-row gap-6 px-4">
          <button
            onClick={() => {
              setQuizMode("spell");
              startRound(words, false, "spell");
            }}
            className="bg-white rounded-2xl shadow-lg p-10 w-64 max-w-full hover:shadow-xl transition-shadow text-center"
          >
            <div className="text-4xl mb-3">⌨️</div>
            <div className="font-bold text-lg">拼写检查</div>
            <div className="text-sm text-black/50 mt-2">看中文意思，拼出单词</div>
          </button>
          <button
            onClick={() => {
              setQuizMode("choice");
              startRound(words, false, "choice");
            }}
            className="bg-white rounded-2xl shadow-lg p-10 w-64 max-w-full hover:shadow-xl transition-shadow text-center"
          >
            <div className="text-4xl mb-3">🎯</div>
            <div className="font-bold text-lg">选择检查</div>
            <div className="text-sm text-black/50 mt-2">看单词，选出正确中文意思</div>
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
    <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col items-center gap-6">
      <div className="w-full flex items-center justify-between text-sm text-black/50">
        <span>
          {isReview ? "📅 复习检查" : "💪 自由练习"} ·{" "}
          {strict ? `强检查 ${mode === "spell" ? "拼写" : "选择"}` : mode === "spell" ? "拼写" : "选择"}
          {isReview && round > 1 && <span className="text-orange-500"> · 第 {round} 轮（未通过循环复习）</span>}
        </span>
        <span>{idx + 1} / {tasks.length}</span>
      </div>

      <div key={`${word.id}-${mode}-${shake}`} className={`w-full bg-white rounded-3xl shadow-lg p-6 sm:p-10 min-h-[22rem] flex flex-col items-center justify-center gap-8 ${shake > 0 && spellState === "wrong" ? "animate-shake" : ""}`}>
        {mode === "spell" ? (
          <>
            <div className="text-center">
              <div className="text-black/40 text-sm mb-2">{word.pos}</div>
              <div className="text-3xl sm:text-4xl font-bold">{word.meaningCn}</div>
            </div>
            {showAnswer ? (
              <div className="text-center flex flex-col items-center gap-3">
                <div className="text-4xl font-bold text-blue-600">{word.text}</div>
                <div className="text-black/40">{word.phonetic}</div>
                <button
                  onClick={next}
                  className="mt-2 bg-foreground text-white rounded-xl px-8 py-2.5 font-bold"
                  autoFocus
                >
                  下一个 →
                </button>
              </div>
            ) : (
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
                {spellState === "wrong" && (
                  <button onClick={giveUp} className="text-sm text-black/40 underline hover:text-black/70">
                    放弃，显示答案
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-center flex items-center gap-3">
              <button
                onClick={() => playAudio(word.audioWord ?? null)}
                className="text-4xl sm:text-5xl font-bold hover:opacity-70 cursor-pointer break-all"
              >
                {word.text}
              </button>
            </div>
            <div className="text-black/40">{word.phonetic}</div>
            <div className="grid grid-cols-1 gap-3 w-full max-w-md">
              {options.map((opt) => {
                const isWrong = wrongPicks.includes(opt);
                return (
                  <button
                    key={opt}
                    disabled={isWrong}
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
          </>
        )}
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
