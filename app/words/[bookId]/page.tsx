"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AudioButton from "@/components/AudioButton";
import { MACARON, Segment } from "@/lib/client";

interface WordItem {
  id: string;
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  segments: Segment[];
  mnemonic: string;
  example1: string;
  example1Cn: string;
  example2: string;
  example2Cn: string;
  audioWord: string | null;
  audioEx1: string | null;
  audioEx2: string | null;
  stage: number | null;
}

interface UnitItem {
  id: string;
  title: string;
  words: WordItem[];
}

export default function BookDetail({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const [book, setBook] = useState<{ id: string; name: string; status: string } | null>(null);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [activeUnit, setActiveUnit] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();

  function load() {
    fetch(`/api/books/${bookId}`).then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.replace("/parent"); // 家长无学习权限
      const d = await r.json();
      setBook(d.book);
      setUnits(d.units);
      if (d.units.length && !activeUnit) setActiveUnit(d.units[0].id);
    });
  }

  useEffect(load, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) return <div className="p-10 text-center text-black/40">加载中…</div>;

  const unit = units.find((u) => u.id === activeUnit) ?? units[0];

  async function toggleMaster(w: WordItem) {
    const mastered = w.stage === null || w.stage < 8;
    await fetch(`/api/words/${w.id}/master`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mastered }),
    });
    load();
  }

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:px-10 flex flex-col md:flex-row gap-4 md:gap-6">
      {/* 单元侧栏（手机端为顶部横向滚动条） */}
      <aside className="md:w-56 shrink-0">
        <h1 className="font-bold text-lg mb-3 leading-snug">{book.name}</h1>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:max-h-[70vh] md:overflow-y-auto md:pr-1 pb-1 md:pb-0">
          {units.map((u) => (
            <button
              key={u.id}
              onClick={() => setActiveUnit(u.id)}
              className={`text-left text-sm rounded-lg px-3 py-2 leading-snug shrink-0 md:shrink ${
                u.id === unit?.id ? "bg-foreground text-white" : "hover:bg-black/5 text-black/70"
              }`}
            >
              {u.title}
              <span className="block text-xs opacity-60">{u.words.length} 词</span>
            </button>
          ))}
        </div>
      </aside>

      {/* 单词列表 */}
      <section className="flex-1">
        {unit && (
          <>
            <h2 className="font-bold text-xl mb-4">{unit.title}</h2>
            <div className="flex flex-col gap-3">
              {unit.words.map((w) => {
                const isOpen = expanded === w.id;
                const mastered = w.stage !== null && w.stage >= 8;
                return (
                  <div
                    key={w.id}
                    className="bg-white rounded-xl shadow-sm p-4 cursor-pointer hover:shadow"
                    onClick={() => setExpanded(isOpen ? null : w.id)}
                  >
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-bold text-xl">{w.text}</span>
                      <span className="text-black/40 text-sm">{w.phonetic}</span>
                      <span className="text-black/40 text-sm italic">{w.pos}</span>
                      <AudioButton file={w.audioWord} />
                      <span className="flex-1" />
                      {mastered && <span className="text-xs text-green-600">已掌握</span>}
                      {w.stage !== null && !mastered && (
                        <span className="text-xs text-blue-500">学习阶段 {w.stage}/8</span>
                      )}
                    </div>
                    <div className="text-black/70 mt-1">{w.meaningCn}</div>

                    {isOpen && (
                      <div className="mt-3 border-t border-black/5 pt-3 flex flex-col gap-3 text-sm">
                        {/* 词根词缀 */}
                        <div className="flex gap-2 flex-wrap items-start">
                          {w.segments.map((s, i) => (
                            <div key={i} className="text-center">
                              <span
                                className="inline-block rounded-lg px-2 py-0.5 font-bold"
                                style={{ background: MACARON[i % MACARON.length] }}
                              >
                                {s.part}
                              </span>
                              <div className="text-xs text-black/50 mt-0.5">{s.meaningCn}</div>
                            </div>
                          ))}
                        </div>
                        {w.mnemonic && <div className="text-black/60">【记忆】{w.mnemonic}</div>}
                        {w.example1 && (
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <div>{w.example1}</div>
                              <div className="text-black/50 text-xs">{w.example1Cn}</div>
                            </div>
                            <AudioButton file={w.audioEx1} />
                          </div>
                        )}
                        {w.example2 && (
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <div>{w.example2}</div>
                              <div className="text-black/50 text-xs">{w.example2Cn}</div>
                            </div>
                            <AudioButton file={w.audioEx2} />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMaster(w);
                          }}
                          className="self-start text-xs border border-black/15 rounded-full px-3 py-1 hover:bg-black/5"
                        >
                          {mastered ? "取消掌握标记" : "标记为已掌握"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
