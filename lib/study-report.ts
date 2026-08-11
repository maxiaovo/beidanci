// 学习报告：汇总一段时间内答错/放弃的单词 → DeepSeek 生成错因精讲 → Qwen TTS 合成朗读音频。
// 生成是异步的：创建记录后立即返回，后台推进 step（collect → narrate → tts），前端轮询状态。
import fs from "fs";
import path from "path";
import { prisma } from "./db";
import { requestDeepSeekJson } from "./deepseek-client";
import { getAiPrompt } from "./ai-prompts";
import { getTTSConfig } from "./settings";
import { synthesizeSpeech } from "./qwen-tts";

export const REPORT_DIR = path.join(process.cwd(), "data", "reports");
export const REPORT_DAILY_LIMIT = 2; // 每个学习主体每天最多生成次数（孩子本人与家长触发合并计数）

export type ReportRange = "today" | "3d" | "7d" | "30d";

const RANGE_DAYS: Record<Exclude<ReportRange, "today">, number> = { "3d": 3, "7d": 7, "30d": 30 };

export class ReportError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ReportError";
  }
}

export function isReportRange(value: unknown): value is ReportRange {
  return value === "today" || value === "3d" || value === "7d" || value === "30d";
}

export function resolveRange(range: ReportRange, now = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  if (range === "today") from.setHours(0, 0, 0, 0);
  else from.setDate(from.getDate() - RANGE_DAYS[range]);
  return { from, to: now };
}

// 单词的失败汇总：失败/放弃次数、实际错误拼写、时段内是否已补对
export interface FailedWordInfo {
  text: string;
  phonetic: string;
  pos: string;
  meaningCn: string;
  meaningEn: string;
  segments: string;
  mnemonic: string;
  example1: string;
  example1Cn: string;
  fails: number;
  giveups: number;
  wrongAttempts: string[];
  recovered: boolean;
}

// 汇总 [from, to] 内检查环节的失败词（纯查询聚合，便于单测）
export async function collectFailedWords(
  userId: string,
  from: Date,
  to: Date,
): Promise<FailedWordInfo[]> {
  const logs = await prisma.studyLog.findMany({
    where: { userId, mode: { startsWith: "check" }, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
    include: {
      word: {
        select: {
          text: true, phonetic: true, pos: true, meaningCn: true, meaningEn: true,
          segments: true, mnemonic: true, example1: true, example1Cn: true,
        },
      },
    },
  });

  const byWord = new Map<string, FailedWordInfo & { id: string }>();
  for (const log of logs) {
    let info = byWord.get(log.wordId);
    if (!info) {
      info = { id: log.wordId, ...log.word, fails: 0, giveups: 0, wrongAttempts: [], recovered: false };
      byWord.set(log.wordId, info);
    }
    if (log.result === "correct") info.recovered = true;
    else if (log.result === "giveup") info.giveups += 1;
    else {
      info.fails += 1;
      if (log.attempt && !info.wrongAttempts.includes(log.attempt)) info.wrongAttempts.push(log.attempt);
    }
  }
  return [...byWord.values()]
    .filter((w) => w.fails > 0 || w.giveups > 0)
    .sort((a, b) => b.fails + b.giveups - (a.fails + a.giveups));
}

export interface StudyReportView {
  id: string;
  status: string;
  step: string;
  error: string;
  content: string;
  hasAudio: boolean;
  rangeStart: Date;
  rangeEnd: Date;
  createdAt: Date;
}

export function serializeReport(r: {
  id: string; status: string; step: string; error: string; content: string;
  audioFile: string | null; rangeStart: Date; rangeEnd: Date; createdAt: Date;
}): StudyReportView {
  return {
    id: r.id,
    status: r.status,
    step: r.step,
    error: r.error,
    content: r.status === "done" ? r.content : "",
    hasAudio: !!r.audioFile,
    rangeStart: r.rangeStart,
    rangeEnd: r.rangeEnd,
    createdAt: r.createdAt,
  };
}

// 创建报告并后台生成；超出每日限额或没有失败词时抛 ReportError
export async function createStudyReport(
  subjectUserId: string,
  range: ReportRange,
  createdBy: string,
): Promise<string> {
  const { from, to } = resolveRange(range);

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const todayCount = await prisma.studyReport.count({
    where: { userId: subjectUserId, createdAt: { gte: start } },
  });
  if (todayCount >= REPORT_DAILY_LIMIT) {
    throw new ReportError(`今天已生成 ${todayCount} 次学习报告，每天最多 ${REPORT_DAILY_LIMIT} 次`, 429);
  }

  const failed = await collectFailedWords(subjectUserId, from, to);
  if (failed.length === 0) {
    throw new ReportError("该时间段内没有答错或放弃的单词，无需生成报告", 400);
  }

  const report = await prisma.studyReport.create({
    data: { userId: subjectUserId, rangeStart: from, rangeEnd: to, createdBy, step: "collect" },
  });

  // 后台异步生成（next start 常驻进程，请求返回后仍会继续执行）；失败落库为 failed
  void runReportGeneration(report.id, failed).catch(async (error) => {
    console.error("学习报告生成异常:", error);
    await prisma.studyReport
      .update({
        where: { id: report.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) },
      })
      .catch(() => {});
  });

  return report.id;
}

interface ReportNarrative {
  report: string;
  spoken: string;
}

function validateNarrative(value: unknown): ReportNarrative {
  const v = value as Partial<ReportNarrative> | null;
  if (!v || typeof v.report !== "string" || !v.report.trim() || typeof v.spoken !== "string" || !v.spoken.trim()) {
    throw new Error("报告内容缺少 report 或 spoken 字段");
  }
  return { report: v.report.trim(), spoken: v.spoken.trim() };
}

async function runReportGeneration(reportId: string, failed: FailedWordInfo[]) {
  // 阶段 1：AI 分析错因并生成精讲 + 朗读稿
  await prisma.studyReport.update({ where: { id: reportId }, data: { step: "narrate" } });
  const systemPrompt = await getAiPrompt("vocabulary.study_report");
  const input = failed.map((w) => ({
    text: w.text,
    phonetic: w.phonetic,
    pos: w.pos,
    meaningCn: w.meaningCn,
    meaningEn: w.meaningEn,
    segments: w.segments,
    mnemonic: w.mnemonic,
    example1: w.example1,
    example1Cn: w.example1Cn,
    fails: w.fails,
    giveups: w.giveups,
    wrongAttempts: w.wrongAttempts,
    recovered: w.recovered,
  }));
  const narrative = await requestDeepSeekJson<ReportNarrative>(
    "vocabulary.study_report",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    validateNarrative,
  );

  // 阶段 2：TTS 合成朗读稿；语音失败不拖垮整份报告（正文照常可用）
  await prisma.studyReport.update({
    where: { id: reportId },
    data: { step: "tts", content: narrative.report, spoken: narrative.spoken },
  });
  let audioFile: string | null = null;
  let ttsError = "";
  try {
    const cfg = await getTTSConfig();
    const out: { error?: string } = {};
    const wav = await synthesizeSpeech(cfg, narrative.spoken, { language: "Auto", out });
    if (wav) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      audioFile = `report-${reportId}.wav`;
      fs.writeFileSync(path.join(REPORT_DIR, audioFile), wav);
    } else {
      ttsError = out.error ?? "语音合成失败";
    }
  } catch (error) {
    ttsError = error instanceof Error ? error.message : String(error);
  }
  if (ttsError) console.error(`学习报告 ${reportId} 语音合成失败: ${ttsError}`);

  await prisma.studyReport.update({
    where: { id: reportId },
    data: { status: "done", step: "done", audioFile, ...(ttsError ? { error: `语音合成失败：${ttsError}` } : {}) },
  });
}
