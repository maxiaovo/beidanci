// 客户端共享：类型、音频播放、提示音
export interface Segment {
  part: string;
  type: "prefix" | "root" | "suffix" | "word";
  meaningCn: string;
}

export interface StudyWord {
  id: string;
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  meaningEn: string;
  segments: Segment[];
  mnemonic: string;
  example1: string;
  example1Cn: string;
  example2: string;
  example2Cn: string;
  audioWord: string | null;
  audioEx1: string | null;
  audioEx2: string | null;
  bookId: string;
  bookName: string;
  unitTitle: string;
  stage?: number | null;
}

// 马卡龙配色
export const MACARON = ["#A8D8EA", "#FFB7B2", "#FFDAC1", "#E2F0CB", "#C7CEEA", "#FFD6E0"];

let currentAudio: HTMLAudioElement | null = null;

export function playAudio(fileName: string | null | undefined) {
  if (!fileName) return;
  currentAudio?.pause();
  currentAudio = new Audio(`/api/audio/${fileName}`);
  currentAudio.play().catch(() => {});
}

// WebAudio 提示音：叮咚（正确）/ 嘟嘟（错误）
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.25) {
  const ac = audioCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration);
}

export function playDing() {
  tone(880, 0, 0.18);
  tone(1318.5, 0.15, 0.35);
}

export function playBuzz() {
  tone(220, 0, 0.16, "square", 0.12);
  tone(196, 0.18, 0.25, "square", 0.12);
}

export async function postProgress(wordId: string, mode: string, result: "correct" | "wrong" | "giveup") {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordId, mode, result }),
  });
}
