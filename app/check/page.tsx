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

  const [words, setWords] = useState<QuizWord[]>([]);
  const [distractors, setDistractors] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode | null>(null);
  const [strict, setStrict] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reviewCleared, setReviewCleared] = useState(false);

  // 拼写题状态
  const [input, setInput] = useState("");
  const [spellState, setSpellState] = useState<"idle" | "correct" | "wrong">("idle");
  const [showAnswer, setShowAnswer] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 选择题状态
  const [options, setOptions] = useState<string[]>([]);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);

  const word = words[idx];

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
      if (d.reviewsCleared) {
        setReviewCleared(true);
      } else {
        setWords(d.reviews);
        preloadAudio(d.reviews.map((w: QuizWord) => w.audioWord));
        setQuizMode(isStrict ? "spell" : (d.stats.defaultCheckMode as QuizMode));
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
      preloadAudio(d.words.map((w: QuizWord) => w.audioWord));
      setDistractors(d.distractors);
      // 强检查：跳过模式选择，每个词依次做拼写 + 选择
      if (isStrict) setQuizMode("spell");
    }
    setLoaded(true);
  }, [isReview, router]);

  useEffect(() => {
    load();
  }, [load]);

  // 生成选择题选项
  useEffect(() => {
    if (!word || quizMode !== "choice") return;
    const pool = distractors.filter((m) => m && m !== word.meaningCn);
    const picks = new Set<string>();
    while (picks.size < 3 && picks.size < pool.length) {
      picks.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    const all = [...picks, word.meaningCn].sort(() => Math.random() - 0.5);
    setOptions(all);
    setWrongPicks([]);
  }, [word, quizMode, distractors]);

  useEffect(() => {
    if (quizMode === "spell") inputRef.current?.focus();
  }, [quizMode, idx]);

  const next = useCallback(async () => {
    if (idx + 1 >= words.length) {
      if (isReview) {
        // 复习完成，重新拉取确认门禁已清
        const r = await fetch("/api/session");
        const d = await r.json();
        if (d.reviewsCleared) setReviewCleared(true);
        else {
          // 答错的词可能又到期（10分钟阶梯外的一般不会，但保底重载）
          setWords(d.reviews);
          setIdx(0);
          if (strict) setQuizMode("spell");
          return;
        }
      }
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setInput("");
      setSpellState("idle");
      setShowAnswer(false);
      // 强检查：下一个词从拼写关重新开始
      if (strict) setQuizMode("spell");
    }
  }, [idx, words.length, isReview, strict]);

  // 拼写提交
  async function submitSpell() {
    if (!word || spellState === "correct" || showAnswer) return;
    const answer = input.trim().toLowerCase();
    if (!answer) return;
    if (answer === word.text.toLowerCase()) {
      playDing();
      setSpellState("correct");
      await postProgress(word.id, "check-spell", "correct");
      if (strict) {
        // 强检查：拼写过了还有选择关
        setTimeout(() => {
          setQuizMode("choice");
          setInput("");
          setSpellState("idle");
          setShowAnswer(false);
        }, 700);
      } else {
        setTimeout(next, 700);
      }
    } else {
      playBuzz();
      setSpellState("wrong");
      setShake((s) => s + 1);
      await postProgress(word.id, "check-spell", "wrong");
    }
  }

  // 放弃
  async function giveUp() {
    if (!word) return;
    setShowAnswer(true);
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
      await postProgress(word.id, "check-choice", "wrong");
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

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
            onClick={() => setQuizMode("spell")}
            className="bg-white rounded-2xl shadow-lg p-10 w-64 max-w-full hover:shadow-xl transition-shadow text-center"
          >
            <div className="text-4xl mb-3">⌨️</div>
            <div className="font-bold text-lg">拼写检查</div>
            <div className="text-sm text-black/50 mt-2">看中文意思，拼出单词</div>
          </button>
          <button
            onClick={() => setQuizMode("choice")}
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
          {strict
            ? `强检查 ${quizMode === "spell" ? "拼写(1/2)" : "选择(2/2)"}`
            : quizMode === "spell" ? "拼写" : "选择"}
        </span>
        <span>{idx + 1} / {words.length}</span>
      </div>

      <div key={`${word.id}-${shake}`} className={`w-full bg-white rounded-3xl shadow-lg p-6 sm:p-10 min-h-[22rem] flex flex-col items-center justify-center gap-8 ${shake > 0 && spellState === "wrong" ? "animate-shake" : ""}`}>
        {quizMode === "spell" ? (
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
    </div>
  );
}
