"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SegmentWord from "@/components/SegmentWord";
import TypingTrainer from "@/components/TypingTrainer";
import AudioButton from "@/components/AudioButton";
import HighlightedSentence from "@/components/HighlightedSentence";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";
import { playAudio, playDing, playBuzz, preloadAudio, postProgress, StudyWord } from "@/lib/client";
import FitWord from "@/components/FitWord";
import { DEFAULT_APPEARANCE, clampPx, type LearnAppearance } from "@/lib/appearance";

type Phase = "show" | "segments" | "ex1" | "ex2" | "trace" | "traceEx1" | "traceEx2" | "selftest";

const PHASE_HINT: Record<Phase, string> = {
  show: "点击单词听发音，确认读音后进入拆解",
  segments: "理解构词、释义和记忆提示",
  ex1: "听第一条例句，观察单词在语境中的用法",
  ex2: "用第二条语境再次辨认含义",
  trace: "跟随浅色字形完成拼写",
  traceEx1: "扩展练习：完整抄写第一条例句",
  traceEx2: "扩展练习：完整抄写第二条例句",
  selftest: "自测：根据中文释义默写单词，验证是否真正记住",
};

const NEXT_PHASE: Partial<Record<Phase, Phase>> = {
  show: "segments",
  segments: "ex1",
  ex1: "ex2",
  ex2: "trace",
};

const PREV_PHASE: Partial<Record<Phase, Phase>> = {
  segments: "show",
  ex1: "segments",
  ex2: "ex1",
  trace: "ex2",
  traceEx1: "trace",
  traceEx2: "traceEx1",
  selftest: "trace",
};

const LEARN_STEPS = ["认识", "拆解", "语境", "拼写", "自测"] as const;
const PHASE_STEP: Record<Phase, number> = {
  show: 0,
  segments: 1,
  ex1: 2,
  ex2: 2,
  trace: 3,
  traceEx1: 3,
  traceEx2: 3,
  selftest: 4,
};

// 学习页外观（全局设置，由管理员在后台统一配置，/api/session 下发）见 lib/appearance.ts

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-black/40">加载中…</div>}>
      <LearnInner />
    </Suspense>
  );
}

function LearnInner() {
  const searchParams = useSearchParams();
  const bookParam = searchParams.get("book"); // 选书学习：?book=<id>
  const [words, setWords] = useState<StudyWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("show");
  const [extended, setExtended] = useState(false);
  const [blocked, setBlocked] = useState<number | null>(null); // 待复习数（门禁）
  const [allowSkip, setAllowSkip] = useState(false); // 管理员允许跳过复习
  const [done, setDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [highlightColor, setHighlightColor] = useState<string | null>(null); // 例句目标词高亮颜色
  const [appearance, setAppearance] = useState<LearnAppearance>(DEFAULT_APPEARANCE); // 学习页外观（全局设置）
  const [msgQueue, setMsgQueue] = useState<ParentMessage[]>([]); // 家长留言弹窗队列
  const shownMsgRef = useRef<Set<string>>(new Set()); // 本次会话已弹过的留言
  const wordMsgsRef = useRef<ParentMessage[]>([]); // word 触发的留言
  const msgTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const passedRef = useRef<Set<string>>(new Set()); // 已通过自测并上报 correct 的词（回退重做不重复上报）
  const router = useRouter();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // 自测相位状态（进入相位时由 enterSelfTest 重置）
  const [stInput, setStInput] = useState("");
  const [stState, setStState] = useState<"idle" | "correct" | "wrong">("idle");
  const [stRevealed, setStRevealed] = useState(false);
  const [stShake, setStShake] = useState(0);

  const loadSession = useCallback(() => {
    fetch(bookParam ? `/api/session?book=${encodeURIComponent(bookParam)}` : "/api/session").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.replace("/parent"); // 家长无学习权限
      const d = await r.json();
      setAllowSkip(!!d.stats.allowSkipReview);
      setHighlightColor(d.stats.highlightColor ?? null);
      setAppearance({ ...DEFAULT_APPEARANCE, ...(d.appearance ?? {}) });
      if (!d.reviewsCleared) {
        setBlocked(d.stats.dueCount);
      } else if (d.newWords.length === 0) {
        setDone(true);
      } else {
        setBlocked(null);
        setWords(d.newWords);
        preloadAudio(d.newWords.flatMap((w: StudyWord) => [w.audioWord, w.audioEx1, w.audioEx2]));
      }
      setLoaded(true);
    });
  }, [router, bookParam]);

  useEffect(loadSession, [loadSession]);

  // 拉取家长留言：start 立即弹出；minutes 定时弹出；word 由 idx 变化触发
  useEffect(() => {
    fetch("/api/messages").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      for (const m of d.messages as ParentMessage[]) {
        if (m.trigger === "start") {
          enqueueMsg(m);
        } else if (m.trigger === "minutes" && m.triggerValue) {
          msgTimersRef.current.push(setTimeout(() => enqueueMsg(m), m.triggerValue * 60_000));
        } else if (m.trigger === "word" && m.triggerValue) {
          wordMsgsRef.current.push(m);
        }
      }
    });
    const timers = msgTimersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // 每条留言每次会话只弹一次
  function enqueueMsg(m: ParentMessage) {
    if (shownMsgRef.current.has(m.id)) return;
    shownMsgRef.current.add(m.id);
    setMsgQueue((q) => [...q, m]);
  }

  // 学到第 N 个词时弹出对应留言
  useEffect(() => {
    for (const m of wordMsgsRef.current) {
      if (m.triggerValue === idx + 1) enqueueMsg(m);
    }
  }, [idx]);

  // 跳过复习：留痕后重新拉取队列（门禁放行）
  async function skipReview() {
    const r = await fetch("/api/skip-review", { method: "POST" });
    if (r.ok) {
      setLoaded(false);
      setBlocked(null);
      loadSession();
    }
  }

  const word: StudyWord | undefined = words[idx];

  // 进入下一个词（或完成）：自测失败的词已重排到队尾，words.length 会增长
  const advanceWord = useCallback(() => {
    if (idx + 1 >= words.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
      setPhase("show");
    }
  }, [idx, words.length]);

  // 自测通过：上报 correct（每词只报一次）后进入下一个词
  const finishWord = useCallback(async () => {
    if (!word) return;
    if (!passedRef.current.has(word.id)) {
      passedRef.current.add(word.id);
      await postProgress(word.id, "learn", "correct");
    }
    advanceWord();
  }, [word, advanceWord]);

  // 自测失败：该词重排到本次学习队列末尾，完整重学后再自测（防重复入队）
  const requeueWord = useCallback(() => {
    if (!word) return;
    setWords((ws) => (ws.slice(idx + 1).some((w) => w.id === word.id) ? ws : [...ws, word]));
  }, [word, idx]);

  // 自测提交：通过 → 上报 correct；答错 → 上报 wrong 并重排队尾重学
  async function submitSelfTest() {
    if (!word || stState === "correct" || stRevealed) return;
    const answer = stInput.trim().toLowerCase();
    if (!answer) return;
    if (answer === word.text.toLowerCase()) {
      playDing();
      setStState("correct");
      setTimeout(() => void finishWord(), 700);
    } else {
      playBuzz();
      setStState("wrong");
      setStShake((s) => s + 1);
      await postProgress(word.id, "learn", "wrong");
      requeueWord();
      setStRevealed(true);
    }
  }

  // 自测放弃：按失败处理，同样上报并重排队尾
  async function giveUpSelfTest() {
    if (!word || stRevealed || stState === "correct") return;
    setStRevealed(true);
    await postProgress(word.id, "learn", "giveup");
    requeueWord();
  }

  // 进入自测相位：重置输入状态（输入框靠 autoFocus 聚焦）
  const enterSelfTest = useCallback(() => {
    setStInput("");
    setStState("idle");
    setStRevealed(false);
    setPhase("selftest");
  }, []);

  // 推进 / 回退阶段
  const advance = useCallback(() => {
    setPhase((prev) => NEXT_PHASE[prev] ?? prev);
  }, []);

  // 回退：show 阶段且不是第一个词时跨词回退，否则按阶段表回退（含临摹、自测阶段）
  const goBack = useCallback(() => {
    if (phaseRef.current === "show") {
      setIdx((i) => (i > 0 ? i - 1 : i));
      setPhase("show");
      return;
    }
    setPhase((prev) => PREV_PHASE[prev] ?? prev);
  }, []);

  // 临摹阶段的"下一步"（仅 Shift+方向键触发）：只允许在临摹阶段间前进，不能直接完成单词
  const advanceTrace = useCallback(() => {
    const p = phaseRef.current;
    if (p === "trace") {
      if (extended && word?.example1) setPhase("traceEx1");
    } else if (p === "traceEx1") {
      setPhase("traceEx2");
    }
  }, [extended, word]);

  // 键盘：浏览阶段方向键/回车导航；临摹、自测阶段方向键需加 Shift（回车归 TypingTrainer / 自测输入框）
  useEffect(() => {
    const backKeys = ["ArrowUp", "ArrowLeft", "PageUp"];
    const nextKeys = ["ArrowDown", "ArrowRight", "PageDown"];
    function onKey(e: KeyboardEvent) {
      const p = phaseRef.current;
      const inTrace = p === "trace" || p === "traceEx1" || p === "traceEx2";
      if (inTrace) {
        if (!e.shiftKey) return;
        if (backKeys.includes(e.key)) {
          e.preventDefault();
          goBack();
        } else if (nextKeys.includes(e.key)) {
          e.preventDefault();
          advanceTrace();
        }
        return;
      }
      if (p === "selftest") {
        if (e.shiftKey && backKeys.includes(e.key)) {
          e.preventDefault();
          goBack();
        }
        return;
      }
      if (backKeys.includes(e.key)) {
        e.preventDefault();
        goBack();
      } else if (nextKeys.includes(e.key) || e.key === "Enter") {
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, advanceTrace, goBack]);

  // 触屏/鼠标：点屏幕右半 = 下一步，左半 = 上一步（点到按钮、链接等交互元素时不触发）
  // 临摹、自测阶段只允许左半返回，前进必须由 TypingTrainer 完成 / 自测通过来触发，防止跳过
  function onTapNav(e: ReactMouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (el.closest("button, a, input, label, select, textarea")) return;
    const p = phaseRef.current;
    const inTrace = p === "trace" || p === "traceEx1" || p === "traceEx2" || p === "selftest";
    if (inTrace) {
      if (e.clientX < window.innerWidth / 2) goBack();
      return;
    }
    if (e.clientX >= window.innerWidth / 2) advance();
    else goBack();
  }

  // 进入 segments 阶段自动播放单词读音
  useEffect(() => {
    if (phase === "segments" && word) playAudio(word.audioWord);
  }, [phase, word]);

  // 进入例句阶段自动播放
  useEffect(() => {
    if (!word) return;
    if (phase === "ex1") playAudio(word.audioEx1);
    if (phase === "ex2") playAudio(word.audioEx2);
  }, [phase, word]);

  function afterTrace() {
    if (extended && word?.example1) {
      setPhase("traceEx1");
    } else {
      enterSelfTest();
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  if (blocked !== null) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">⏰</div>
          <h2 className="font-bold text-xl mb-2">先完成复习才能学新词</h2>
          <p className="text-black/60 mb-6">按艾宾浩斯记忆曲线，你今天还有 {blocked} 个单词到期要复习检查。</p>
          <Link
            href="/check?mode=review"
            className="inline-block bg-orange-500 text-white rounded-xl px-8 py-3 font-bold hover:opacity-90"
          >
            去复习 {blocked} 词 →
          </Link>
          {allowSkip && (
            <div className="mt-4">
              <button
                onClick={skipReview}
                className="text-sm text-black/40 underline underline-offset-4 hover:text-black/70 cursor-pointer"
              >
                跳过复习，直接学新词（家长会看到记录）
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="font-bold text-xl mb-2">今日新词全部完成！</h2>
          <p className="text-black/60 mb-6">记得明天回来按记忆曲线复习哦。</p>
          <Link href="/" className="inline-block bg-foreground text-white rounded-xl px-8 py-3 font-bold">
            回到首页
          </Link>
        </div>
      </div>
    );
  }

  if (!word) return null;

  const sentenceStyle = { fontSize: clampPx(appearance.sentenceSizePx) };
  const sentenceCnStyle = { fontSize: `${appearance.sentenceCnSizePx}px` };
  const activeStep = PHASE_STEP[phase];
  const inTrace = phase === "trace" || phase === "traceEx1" || phase === "traceEx2";

  return (
    <div
      className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 p-4 select-none sm:p-6 lg:px-10"
      style={{ width: `${appearance.cardWidthPct}%` }}
      onClick={onTapNav}
    >
      <MessageOverlay queue={msgQueue} onClose={(id) => setMsgQueue((q) => q.filter((m) => m.id !== id))} />
      {/* 顶部进度 + 扩展模式开关 + 退出 */}
      <div className="w-full">
        <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-2 text-sm text-black/50">
          <span>{word.bookName} · {word.unitTitle}</span>
          <span>第 {idx + 1} / {words.length} 词</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={extended}
              onChange={(e) => setExtended(e.target.checked)}
              className="accent-foreground"
            />
            扩展模式（抄写例句）
          </label>
          <Link href="/learning-guide" className="font-bold text-foreground/70 hover:text-foreground transition-colors">
            查看学习路线
          </Link>
          <Link href="/" className="hover:text-black transition-colors">
            ✕ 退出
          </Link>
        </div>
        {/* 进度条：填充宽度 = 已完成词数 / 总词数 */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(idx / words.length) * 100}%` }} />
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-2" aria-label="学习步骤">
          {LEARN_STEPS.map((label, stepIndex) => (
            <li
              key={label}
              aria-current={stepIndex === activeStep ? "step" : undefined}
              className={`rounded-xl px-3 py-2 text-center text-xs font-bold transition-colors sm:text-sm ${
                stepIndex === activeStep
                  ? "bg-foreground text-white shadow-md"
                  : stepIndex < activeStep
                    ? "bg-accent/18 text-foreground"
                    : "bg-white/65 text-black/32"
              }`}
            >
              <span className="mr-1.5 hidden sm:inline">{stepIndex + 1}</span>{label}
            </li>
          ))}
        </ol>
      </div>

      {/* 大卡片 */}
      <div
        key={phase === "selftest" ? `${word.id}-selftest-${stShake}` : "learn-card"}
        className={`w-full bg-white rounded-3xl shadow-lg p-6 sm:p-10 flex flex-col items-center justify-center gap-8 ${stShake > 0 && stState === "wrong" ? "animate-shake" : ""}`}
        style={{ minHeight: `${Math.round(appearance.wordSizePx * 4.3)}px` }}
      >
        {phase === "show" && (
          <>
            <button
              onClick={() => playAudio(word.audioWord)}
              className="font-bold tracking-wide hover:opacity-70 transition-opacity cursor-pointer max-w-full"
              title="点击播放读音"
            >
              <FitWord text={word.text} sizePx={appearance.wordSizePx} />
            </button>
            <div className="text-black/40 text-xl">{word.phonetic}</div>
          </>
        )}

        {phase === "segments" && (
          <>
            <SegmentWord key={word.id} segments={word.segments} sizePx={appearance.segmentSizePx} />
            <div className="text-center">
              <span className="text-black/40 mr-3">{word.phonetic}</span>
              <AudioButton file={word.audioWord} size="lg" />
            </div>
            {word.mnemonic && (
              <div className="text-black/60 text-center max-w-lg">【记忆】{word.mnemonic}</div>
            )}
            <div className="text-lg text-black/80">{word.pos} {word.meaningCn}</div>
          </>
        )}

        {(phase === "ex1" || phase === "ex2") && (
          <>
            <button
              onClick={() => playAudio(word.audioWord)}
              className="font-bold hover:opacity-70 cursor-pointer max-w-full"
            >
              <FitWord text={word.text} sizePx={appearance.wordSizePx} />
            </button>
            <div className="flex flex-col gap-6 w-full">
              <div>
                <button
                  onClick={() => playAudio(word.audioEx1)}
                  className={`w-full text-center cursor-pointer rounded-xl p-3 transition-colors ${
                    phase === "ex1" ? "bg-accent/30" : "opacity-40 hover:opacity-70"
                  }`}
                >
                  <HighlightedSentence
                    sentence={word.example1}
                    word={word.text}
                    color={highlightColor}
                    className="block"
                    style={sentenceStyle}
                  />
                  <div className="text-black/50 mt-1" style={sentenceCnStyle}>{word.example1Cn}</div>
                </button>
              </div>
              {phase === "ex2" && (
                <div>
                  <button
                    onClick={() => playAudio(word.audioEx2)}
                    className="w-full text-center cursor-pointer rounded-xl p-3 bg-[#FFDAC1]/30"
                  >
                    <HighlightedSentence
                      sentence={word.example2}
                      word={word.text}
                      color={highlightColor}
                      className="block"
                      style={sentenceStyle}
                    />
                    <div className="text-black/50 mt-1" style={sentenceCnStyle}>{word.example2Cn}</div>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {phase === "trace" && (
          <>
            <div className="text-black/40">{word.phonetic} · {word.meaningCn}</div>
            <TypingTrainer
              key={`${word.id}:word`}
              target={word.text}
              onComplete={afterTrace}
              fontSizePx={Math.round(appearance.wordSizePx * 0.75)}
            />
          </>
        )}

        {phase === "traceEx1" && (
          <>
            <div className="text-black/50">抄写例句 1 / 2</div>
            <TypingTrainer
              key={`${word.id}:example1`}
              target={word.example1}
              onComplete={() => setPhase("traceEx2")}
              fontSizePx={Math.round(appearance.sentenceSizePx * 1.2)}
            />
          </>
        )}

        {phase === "traceEx2" && (
          <>
            <div className="text-black/50">抄写例句 2 / 2</div>
            <TypingTrainer
              key={`${word.id}:example2`}
              target={word.example2}
              onComplete={enterSelfTest}
              fontSizePx={Math.round(appearance.sentenceSizePx * 1.2)}
            />
          </>
        )}

        {phase === "selftest" && (
          <>
            <div className="text-center">
              <div className="text-black/40 text-sm mb-2">自测 · {word.pos}</div>
              <div className="text-3xl sm:text-4xl font-bold">{word.meaningCn}</div>
            </div>
            {stState === "correct" ? (
              <div className="text-center text-green-500 font-bold text-3xl">{word.text} ✓</div>
            ) : stRevealed ? (
              <div className="text-center flex flex-col items-center gap-3">
                <div className="text-black/40 text-sm">正确拼写</div>
                <div className="font-bold text-blue-600 max-w-full">
                  <FitWord text={word.text} sizePx={36} />
                </div>
                <div className="text-black/40">{word.phonetic}</div>
                <div className="text-orange-500/90 text-sm">这个词已排到本次学习末尾，稍后会重新学习一遍</div>
                <button
                  type="button"
                  onClick={advanceWord}
                  className="mt-2 bg-foreground text-white rounded-xl px-8 py-2.5 font-bold"
                  autoFocus
                >
                  下一个 →
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                <input
                  value={stInput}
                  onChange={(e) => {
                    setStInput(e.target.value);
                    setStState("idle");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && submitSelfTest()}
                  placeholder="默写单词后按回车"
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`w-full text-center text-3xl font-bold border-b-4 outline-none py-2 bg-transparent transition-colors ${
                    stState === "wrong" ? "text-red-500 border-red-400" : "border-black/15 focus:border-accent"
                  }`}
                />
                <button
                  type="button"
                  onClick={giveUpSelfTest}
                  className="text-sm text-black/45 underline underline-offset-4 hover:text-orange-600"
                >
                  想不起来，查看答案
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={phase === "show" && idx === 0}
          className="rounded-xl border border-black/10 bg-white/75 px-5 py-2.5 text-sm font-bold text-foreground transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          ← 上一步
        </button>
        <div className="text-center text-sm text-black/42">{PHASE_HINT[phase]}</div>
        {inTrace ? (
          <span className="rounded-xl bg-accent/12 px-5 py-2.5 text-sm font-bold text-foreground">输入完成后按回车</span>
        ) : phase === "selftest" ? (
          <span className="rounded-xl bg-accent/12 px-5 py-2.5 text-sm font-bold text-foreground">默写单词后按回车</span>
        ) : (
          <button
            type="button"
            onClick={advance}
            className="rounded-xl bg-foreground px-6 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            下一步 →
          </button>
        )}
      </div>
    </div>
  );
}
