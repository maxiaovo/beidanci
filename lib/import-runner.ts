// 导入后台任务：DeepSeek 分析 → 入库 → TTS 音频
// 全局串行队列：同一时间只处理一本书，其余排队等待
// 断点续传：分析阶段跳过已入库单元，音频阶段只补缺失条目；原始文本存 Book.rawUnits
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { analyzeUnitText } from "./deepseek";
import { AUDIO_DIR, synthesize } from "./tts";
import type { RawUnit } from "./parsers";

interface Job {
  bookId: string;
  units: RawUnit[];
}

// 进程内队列与状态（服务为常驻 Node 进程，重启后队列丢失，书状态停留在 queued/processing）
const queue: Job[] = [];
const stopRequested = new Set<string>();
let processing = false;

// ---- 导入实况日志（内存环形缓冲，供管理员面板轮询） ----
export interface ImportEvent {
  ts: number;
  kind: "word" | "audio" | "info";
  bookId: string;
  text: string; // word: "apple /ˈæp.l/ n. 苹果"；audio: "apple · 单词发音 ✓"
  ok?: boolean; // audio 事件是否成功
}
const events: ImportEvent[] = [];
const MAX_EVENTS = 200;

export function logImportEvent(e: Omit<ImportEvent, "ts">) {
  events.push({ ...e, ts: Date.now() });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function getImportStatus() {
  return {
    processing,
    queueLength: queue.length,
    currentBookId: processing ? currentBookId : null,
    events: events.slice(-100),
  };
}

let currentBookId: string | null = null;

// 加入导入队列；若队列空闲会立即开始，否则等待前面的书完成
export function enqueueImport(bookId: string, units: RawUnit[]) {
  queue.push({ bookId, units });
  void pump();
}

// 断点续传：从 Book.rawUnits 恢复任务并入队；已在队列/处理中则忽略
// 旧书没有 rawUnits 时以空单元列表入队——分析阶段自动跳过，只补缺失音频
export async function resumeImport(bookId: string): Promise<{ ok: boolean; error?: string }> {
  if (currentBookId === bookId || queue.some((j) => j.bookId === bookId)) return { ok: true };
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return { ok: false, error: "单词书不存在" };
  let units: RawUnit[] = [];
  try {
    units = JSON.parse(book.rawUnits || "[]");
  } catch {
    units = [];
  }
  if (!units.length) {
    logImportEvent({ kind: "info", bookId, text: "该书无原始文本记录，仅补齐缺失音频" });
  }
  await prisma.book.update({ where: { id: bookId }, data: { status: "queued" } });
  enqueueImport(bookId, units);
  return { ok: true };
}

// 请求停止某本书的导入（排队中则直接移除；处理中则在当前 AI 调用结束后停止）
export function requestStop(bookId: string) {
  const qi = queue.findIndex((j) => j.bookId === bookId);
  if (qi >= 0) {
    queue.splice(qi, 1);
    void prisma.book
      .update({ where: { id: bookId }, data: { status: "stopped" } })
      .catch(() => {});
    return;
  }
  stopRequested.add(bookId);
}

function isStopped(bookId: string): boolean {
  return stopRequested.has(bookId);
}

async function pump() {
  if (processing) return;
  const job = queue.shift();
  if (!job) return;
  processing = true;
  currentBookId = job.bookId;
  try {
    await runImport(job.bookId, job.units);
  } finally {
    stopRequested.delete(job.bookId);
    processing = false;
    currentBookId = null;
    void pump(); // 串行处理下一本
  }
}

async function runImport(bookId: string, units: RawUnit[]) {
  try {
    // 排队期间可能已被停止或删除
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || book.status === "stopped") return;

    await prisma.book.update({
      where: { id: bookId },
      data: { status: "processing", analyzeTotal: units.length, analyzeDone: 0 },
    });

    // 1) 逐单元分析并入库（断点续传：已入库且非空的单元跳过；空单元删掉重做）
    const existingUnits = await prisma.unit.findMany({
      where: { bookId },
      select: { id: true, orderIndex: true, _count: { select: { words: true } } },
    });
    const unitByIndex = new Map(existingUnits.map((u) => [u.orderIndex, u]));
    for (let ui = 0; ui < units.length; ui++) {
      if (isStopped(bookId)) throw new Stopped();
      const ex = unitByIndex.get(ui);
      if (ex && ex._count.words > 0) {
        await prisma.book.update({ where: { id: bookId }, data: { analyzeDone: ui + 1 } });
        continue;
      }
      if (ex) await prisma.unit.delete({ where: { id: ex.id } });
      const raw = units[ui];
      let words;
      try {
        words = await analyzeUnitText(raw.text);
      } catch (e) {
        if (e instanceof Stopped) throw e;
        console.error(`单元「${raw.title}」分析失败:`, e);
        logImportEvent({ kind: "info", bookId, text: `⚠ 单元「${raw.title}」分析失败，已跳过`, ok: false });
        // 跳过失败单元，不拖垮整本书；进度照样推进
        await prisma.book.update({ where: { id: bookId }, data: { analyzeDone: ui + 1 } });
        continue;
      }
      if (isStopped(bookId)) throw new Stopped();
      const unit = await prisma.unit.create({
        data: { bookId, title: raw.title, orderIndex: ui },
      });
      logImportEvent({ kind: "info", bookId, text: `单元「${raw.title}」解析出 ${words.length} 个单词` });
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        await prisma.word.create({
          data: {
            unitId: unit.id,
            orderIndex: wi,
            text: w.text,
            phonetic: w.phonetic,
            pos: w.pos,
            meaningCn: w.meaningCn,
            meaningEn: w.meaningEn,
            segments: JSON.stringify(w.segments),
            mnemonic: w.mnemonic,
            example1: w.example1,
            example1Cn: w.example1Cn,
            example2: w.example2,
            example2Cn: w.example2Cn,
          },
        });
        logImportEvent({
          kind: "word",
          bookId,
          text: `${w.text} ${w.phonetic} ${w.pos} ${w.meaningCn}`.trim(),
        });
      }
      await prisma.book.update({ where: { id: bookId }, data: { analyzeDone: ui + 1 } });
    }

    // 2) 批量生成音频
    const allWords = await prisma.word.findMany({
      where: { unit: { bookId } },
      orderBy: [{ unit: { orderIndex: "asc" } }, { orderIndex: "asc" }],
    });
    await prisma.book.update({
      where: { id: bookId },
      data: { audioTotal: allWords.length * 3, audioDone: 0 },
    });

    let done = 0;
    logImportEvent({ kind: "info", bookId, text: `开始生成音频，共 ${allWords.length * 3} 条` });
    for (const w of allWords) {
      if (isStopped(bookId)) throw new Stopped();
      const out: { voice?: string } = {};
      // 断点续传：已有记录且文件存在的条目跳过，只补缺失的
      let audioWord = w.audioWord;
      if (!hasAudioFile(audioWord)) {
        audioWord = await synthesize(w.text, `${w.id}_word.wav`, { out });
        logImportEvent({ kind: "audio", bookId, text: `${w.text} · 单词发音${voiceTag(out)}`, ok: !!audioWord });
        if (isStopped(bookId)) throw new Stopped();
      }
      done++;
      let audioEx1 = w.audioEx1;
      if (!hasAudioFile(audioEx1)) {
        audioEx1 = await synthesize(w.example1, `${w.id}_ex1.wav`, { out });
        logImportEvent({ kind: "audio", bookId, text: `${w.text} · 例句1${voiceTag(out)}：${w.example1.slice(0, 60)}`, ok: !!audioEx1 });
        if (isStopped(bookId)) throw new Stopped();
      }
      done++;
      let audioEx2 = w.audioEx2;
      if (!hasAudioFile(audioEx2)) {
        audioEx2 = await synthesize(w.example2, `${w.id}_ex2.wav`, { out });
        logImportEvent({ kind: "audio", bookId, text: `${w.text} · 例句2${voiceTag(out)}：${w.example2.slice(0, 60)}`, ok: !!audioEx2 });
      }
      done++;
      await prisma.word.update({
        where: { id: w.id },
        data: { audioWord, audioEx1, audioEx2 },
      });
      await prisma.book.update({ where: { id: bookId }, data: { audioDone: done } });
    }

    await prisma.book.update({ where: { id: bookId }, data: { status: "ready" } });
    logImportEvent({ kind: "info", bookId, text: "✓ 导入完成" });
  } catch (e) {
    if (e instanceof Stopped) {
      // 用户主动停止：保留已生成内容，标记为已停止
      await prisma.book
        .update({ where: { id: bookId }, data: { status: "stopped" } })
        .catch(() => {});
      return;
    }
    console.error("导入任务失败:", e);
    await prisma.book.update({ where: { id: bookId }, data: { status: "error" } }).catch(() => {});
  }
}

class Stopped extends Error {
  constructor() {
    super("导入已被用户停止");
  }
}

// 日志中标注本次合成使用的音色
function voiceTag(out: { voice?: string }): string {
  return out.voice ? `（${out.voice}）` : "";
}

// 音频记录有效 = 数据库有文件名且文件真实存在（防止文件被清理后漏补）
function hasAudioFile(name: string | null): boolean {
  return !!name && fs.existsSync(path.join(AUDIO_DIR, name));
}
