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

// 音频内容整体替换时递增此版本号，强制所有浏览器重新拉取（URL 带版本号，配合服务端 immutable 长缓存）
const AUDIO_VERSION = 2;

function audioUrl(fileName: string) {
  return `/api/audio/${fileName}?v=${AUDIO_VERSION}`;
}

// 复用单个 <audio> 元素：移动端（尤其 iOS Safari）只允许被用户手势解锁过的元素程序化播放，
// 每次 new Audio() 的新元素在 useEffect 里 play() 会被自动播放策略拦截（即"移动端没声音"的根因）
let el: HTMLAudioElement | null = null;
let unlocked = false;

function audioEl(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

// 44 字节空 WAV，首次用户手势时播放它以解锁音频权限
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=";

// 内存缓存：fileName -> ObjectURL（预加载后立即可播，无需再发请求）
const audioCache = new Map<string, string>();

export function playAudio(fileName: string | null | undefined) {
  if (!fileName) return;
  const a = audioEl();
  a.pause();
  a.src = audioCache.get(fileName) ?? audioUrl(fileName);
  a.play().catch(() => {});
}

// 预加载一批音频：拉取为 Blob 存 ObjectURL；服务端响应头是 immutable 长缓存，
// 浏览器磁盘缓存同时生效，后续会话直接命中本地缓存
export function preloadAudio(fileNames: (string | null | undefined)[]) {
  for (const name of new Set(fileNames)) {
    if (!name || audioCache.has(name)) continue;
    fetch(audioUrl(name))
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!audioCache.has(name)) audioCache.set(name, URL.createObjectURL(blob));
      })
      .catch(() => {});
  }
}

// 首次用户手势：解锁 <audio> 元素并 resume WebAudio 上下文
if (typeof window !== "undefined") {
  const unlock = () => {
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    if (unlocked) return;
    unlocked = true;
    const a = audioEl();
    a.src = SILENT_WAV;
    a.play()
      .then(() => a.pause())
      .catch(() => {
        unlocked = false; // 解锁失败，下次手势重试
      });
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

// WebAudio 提示音：叮咚（正确）/ 嘟嘟（错误）
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
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

// 呱呱（青蛙叫）：低频锯齿波短促下滑，用于空格位置输错时
export function playGua() {
  const ac = audioCtx();
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(140, ac.currentTime + 0.18);
  g.gain.setValueAtTime(0.2, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
  osc.connect(g).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + 0.2);
}

export async function postProgress(wordId: string, mode: string, result: "correct" | "wrong" | "giveup") {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wordId, mode, result }),
  });
}
