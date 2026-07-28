"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SegmentWord from "@/components/SegmentWord";
import TypingTrainer from "@/components/TypingTrainer";
import AudioButton from "@/components/AudioButton";
import { playAudio, postProgress, StudyWord } from "@/lib/client";

type Phase = "show" | "segments" | "ex1" | "ex2" | "trace" | "traceEx1" | "traceEx2";

const PHASE_HINT: Record<Phase, string> = {
  show: "按回车，看词根词缀拆解",
  segments: "按回车，看例句 1",
  ex1: "按回车，看例句 2",
  ex2: "按回车，开始临摹单词",
  trace: "",
  traceEx1: "",
  traceEx2: "",
};

export default function LearnPage() {
  const [words, setWords] = useState<StudyWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("show");
  const [extended, setExtended] = useState(false);
  const [blocked, setBlocked] = useState<number | null>(null); // 待复习数（门禁）
  const [done, setDone] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const router = useRouter();
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    fetch("/api/session").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      const d = await r.json();
      if (!d.reviewsCleared) {
        setBlocked(d.stats.dueCount);
      } else if (d.newWords.length === 0) {
        setDone(true);
      } else {
        setWords(d.newWords);
      }
      setLoaded(true);
    });
  }, [router]);

  const word: StudyWord | undefined = words[idx];

  const finishWord = useCallback(async () => {
    if (!word) return;
    await postProgress(word.id, "learn", "correct");
    if (idx + 1 >= words.length) {
      setDone(true);
    } else {
      setIdx(idx + 1);
      setPhase("show");
    }
  }, [word, idx, words.length]);

  // 回车推进阶段（临摹阶段由 TypingTrainer 自己接管键盘）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter") return;
      const p = phaseRef.current;
      if (p === "trace" || p === "traceEx1" || p === "traceEx2") return;
      e.preventDefault();
      setPhase((prev) => {
        const next: Record<string, Phase> = {
          show: "segments",
          segments: "ex1",
          ex1: "ex2",
          ex2: "trace",
        };
        return next[prev] ?? prev;
      });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const inTrace = phase === "trace" || phase === "traceEx1" || phase === "traceEx2";

  return (
    <div className="max-w-4xl mx-auto p-6 flex flex-col items-center gap-6 select-none">
      {/* 顶部进度 + 扩展模式开关 */}
      <div className="w-full flex items-center justify-between text-sm text-black/50">
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
      </div>

      {/* 大卡片 */}
      <div className="w-full bg-white rounded-3xl shadow-lg p-10 min-h-[26rem] flex flex-col items-center justify-center gap-8">
        {phase === "show" && (
          <>
            <button
              onClick={() => playAudio(word.audioWord)}
              className="text-7xl font-bold tracking-wide hover:opacity-70 transition-opacity cursor-pointer"
              title="点击播放读音"
            >
              {word.text}
            </button>
            <div className="text-black/40 text-xl">{word.phonetic}</div>
          </>
        )}

        {phase === "segments" && (
          <>
            <SegmentWord segments={word.segments} />
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
              className="text-4xl font-bold hover:opacity-70 cursor-pointer"
            >
              {word.text}
            </button>
            <div className="flex flex-col gap-6 max-w-2xl">
              <button
                onClick={() => playAudio(word.audioEx1)}
                className={`text-center cursor-pointer rounded-xl p-3 transition-colors ${
                  phase === "ex1" ? "bg-accent/30" : "opacity-40 hover:opacity-70"
                }`}
              >
                <div className="text-2xl">{word.example1}</div>
                <div className="text-black/50 mt-1">{word.example1Cn}</div>
              </button>
              {phase === "ex2" && (
                <button
                  onClick={() => playAudio(word.audioEx2)}
                  className="text-center cursor-pointer rounded-xl p-3 bg-[#FFDAC1]/30"
                >
                  <div className="text-2xl">{word.example2}</div>
                  <div className="text-black/50 mt-1">{word.example2Cn}</div>
                </button>
              )}
            </div>
          </>
        )}

        {phase === "trace" && (
          <>
            <div className="text-black/40">{word.phonetic} · {word.meaningCn}</div>
            <TypingTrainer target={word.text} onComplete={afterTrace} fontSize="text-6xl" />
          </>
        )}

        {phase === "traceEx1" && (
          <>
            <div className="text-black/50">抄写例句 1 / 2</div>
            <TypingTrainer target={word.example1} onComplete={() => setPhase("traceEx2")} fontSize="text-3xl" />
          </>
        )}

        {phase === "traceEx2" && (
          <>
            <div className="text-black/50">抄写例句 2 / 2</div>
            <TypingTrainer target={word.example2} onComplete={finishWord} fontSize="text-3xl" />
          </>
        )}
      </div>

      {!inTrace && (
        <div className="text-black/40 text-sm bg-white/70 rounded-full px-4 py-1.5">
          ⏎ {PHASE_HINT[phase]}
        </div>
      )}
    </div>
  );
}
