"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SegmentWord from "@/components/SegmentWord";
import TypingTrainer from "@/components/TypingTrainer";
import AudioButton from "@/components/AudioButton";
import HighlightedSentence from "@/components/HighlightedSentence";
import MessageOverlay, { ParentMessage } from "@/components/MessageOverlay";
import { playAudio, preloadAudio, postProgress, StudyWord } from "@/lib/client";

type Phase = "show" | "segments" | "ex1" | "ex2" | "trace" | "traceEx1" | "traceEx2";

const PHASE_HINT: Record<Phase, string> = {
  show: "→ / 回车：词根词缀拆解 · ←：返回上一步",
  segments: "→ / 回车：例句 1 · ←：返回上一步",
  ex1: "→ / 回车：例句 2 · ←：返回上一步",
  ex2: "→ / 回车：开始临摹 · ←：返回上一步",
  trace: "临摹单词，完成后回车继续 · Shift+← 返回上一步",
  traceEx1: "抄写例句 1，完成后回车继续 · Shift+← 返回上一步",
  traceEx2: "抄写例句 2，完成后回车结束 · Shift+← 返回上一步",
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
};

// 学习页字号档位（由管理员在后台按用户设置，/api/session 下发）
type SizeLevel = "big" | "bigger" | "biggest";

const SIZE_LEVELS: SizeLevel[] = ["big", "bigger", "biggest"];

function asSizeLevel(v: unknown): SizeLevel {
  return SIZE_LEVELS.includes(v as SizeLevel) ? (v as SizeLevel) : "big";
}

const CARD_MIN_H: Record<SizeLevel, string> = {
  big: "min-h-[26rem]",
  bigger: "min-h-[32rem]",
  biggest: "min-h-[38rem]",
};

const WORD_SIZE: Record<SizeLevel, string> = {
  big: "text-6xl sm:text-8xl",
  bigger: "text-7xl sm:text-9xl",
  biggest: "text-8xl sm:text-[10rem]",
};

const SENTENCE_SIZE: Record<SizeLevel, string> = {
  big: "text-2xl sm:text-3xl",
  bigger: "text-3xl sm:text-4xl",
  biggest: "text-4xl sm:text-5xl",
};

const SENTENCE_CN_SIZE: Record<SizeLevel, string> = {
  big: "text-base",
  bigger: "text-lg",
  biggest: "text-2xl",
};

const TRACE_SIZE: Record<SizeLevel, string> = {
  big: "text-5xl sm:text-7xl",
  bigger: "text-6xl sm:text-8xl",
  biggest: "text-7xl sm:text-9xl",
};

const TRACE_EX_SIZE: Record<SizeLevel, string> = {
  big: "text-2xl sm:text-4xl",
  bigger: "text-3xl sm:text-5xl",
  biggest: "text-4xl sm:text-6xl",
};

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
  const [sizes, setSizes] = useState({ wordSize: "big", segmentSize: "big", sentenceSize: "big", sentenceCnSize: "big" } as { wordSize: SizeLevel; segmentSize: SizeLevel; sentenceSize: SizeLevel; sentenceCnSize: SizeLevel }); // 管理员配置的字号档位
  const [msgQueue, setMsgQueue] = useState<ParentMessage[]>([]); // 家长留言弹窗队列
  const shownMsgRef = useRef<Set<string>>(new Set()); // 本次会话已弹过的留言
  const wordMsgsRef = useRef<ParentMessage[]>([]); // word 触发的留言
  const msgTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const submittedRef = useRef<Set<string>>(new Set()); // 已提交过进度的 wordId（回退重做不重复计数）
  const router = useRouter();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const loadSession = useCallback(() => {
    fetch(bookParam ? `/api/session?book=${encodeURIComponent(bookParam)}` : "/api/session").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.replace("/parent"); // 家长无学习权限
      const d = await r.json();
      setAllowSkip(!!d.stats.allowSkipReview);
      setHighlightColor(d.stats.highlightColor ?? null);
      setSizes({
        wordSize: asSizeLevel(d.stats.wordSize),
        segmentSize: asSizeLevel(d.stats.segmentSize),
        sentenceSize: asSizeLevel(d.stats.sentenceSize),
        sentenceCnSize: asSizeLevel(d.stats.sentenceCnSize),
      });
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

  const finishWord = useCallback(async () => {
    if (!word) return;
    // 回退重做不重复上报进度
    if (!submittedRef.current.has(word.id)) {
      submittedRef.current.add(word.id);
      await postProgress(word.id, "learn", "correct");
    }
    if (idx + 1 >= words.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
      setPhase("show");
    }
  }, [word, idx, words.length]);

  // 推进 / 回退阶段
  const advance = useCallback(() => {
    setPhase((prev) => NEXT_PHASE[prev] ?? prev);
  }, []);

  // 回退：show 阶段且不是第一个词时跨词回退，否则按阶段表回退（含临摹阶段）
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

  // 键盘：浏览阶段方向键/回车导航；临摹阶段方向键需加 Shift（回车归 TypingTrainer）
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
  // 临摹阶段只允许左半返回，前进必须由 TypingTrainer 完成来触发，防止跳过
  function onTapNav(e: ReactMouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement;
    if (el.closest("button, a, input, label, select, textarea")) return;
    const p = phaseRef.current;
    const inTrace = p === "trace" || p === "traceEx1" || p === "traceEx2";
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
      finishWord();
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

  const wordCls = WORD_SIZE[sizes.wordSize];
  const sentenceCls = SENTENCE_SIZE[sizes.sentenceSize];
  const sentenceCnCls = SENTENCE_CN_SIZE[sizes.sentenceCnSize];

  return (
    <div
      className="max-w-6xl mx-auto p-4 sm:p-6 flex flex-col items-center gap-6 select-none"
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
          <Link href="/" className="hover:text-black transition-colors">
            ✕ 退出
          </Link>
        </div>
        {/* 进度条：填充宽度 = 已完成词数 / 总词数 */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-black/10 overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(idx / words.length) * 100}%` }} />
        </div>
      </div>

      {/* 大卡片 */}
      <div className={`w-full bg-white rounded-3xl shadow-lg p-6 sm:p-10 ${CARD_MIN_H[sizes.wordSize]} flex flex-col items-center justify-center gap-8`}>
        {phase === "show" && (
          <>
            <button
              onClick={() => playAudio(word.audioWord)}
              className={`${wordCls} font-bold tracking-wide hover:opacity-70 transition-opacity cursor-pointer break-all`}
              title="点击播放读音"
            >
              {word.text}
            </button>
            <div className="text-black/40 text-xl">{word.phonetic}</div>
          </>
        )}

        {phase === "segments" && (
          <>
            <SegmentWord key={word.id} segments={word.segments} size={sizes.segmentSize} />
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
              className={`${wordCls} font-bold hover:opacity-70 cursor-pointer break-all`}
            >
              {word.text}
            </button>
            <div className="flex flex-col gap-6 w-full max-w-4xl">
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
                    className={`block ${sentenceCls}`}
                  />
                  <div className={`text-black/50 mt-1 ${sentenceCnCls}`}>{word.example1Cn}</div>
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
                      className={`block ${sentenceCls}`}
                    />
                    <div className={`text-black/50 mt-1 ${sentenceCnCls}`}>{word.example2Cn}</div>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {phase === "trace" && (
          <>
            <div className="text-black/40">{word.phonetic} · {word.meaningCn}</div>
            <TypingTrainer target={word.text} onComplete={afterTrace} fontSize={TRACE_SIZE[sizes.wordSize]} />
          </>
        )}

        {phase === "traceEx1" && (
          <>
            <div className="text-black/50">抄写例句 1 / 2</div>
            <TypingTrainer target={word.example1} onComplete={() => setPhase("traceEx2")} fontSize={TRACE_EX_SIZE[sizes.sentenceSize]} />
          </>
        )}

        {phase === "traceEx2" && (
          <>
            <div className="text-black/50">抄写例句 2 / 2</div>
            <TypingTrainer target={word.example2} onComplete={finishWord} fontSize={TRACE_EX_SIZE[sizes.sentenceSize]} />
          </>
        )}
      </div>

      <div className="text-black/40 text-sm bg-white/70 rounded-full px-4 py-1.5 text-center">
        👆 {PHASE_HINT[phase]}
      </div>
    </div>
  );
}
