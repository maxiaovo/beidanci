import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser, isParent } from "@/lib/session";
import { isStrictCheck } from "@/lib/settings";
import { bookVisibleWhere, bookEnrolledWhere } from "@/lib/book-access";
import { decideProgress, type ProgressMode, type ProgressResult } from "@/lib/progress-decision";

// 记录一次学习/检查结果，推进记忆曲线
// 强检查开启时：拼写检查和选择检查都答对才算通过（stage 才推进）
// 分支说明：
// - practice=true：自由练习，只写 StudyLog，完全不碰 WordProgress
// - result="defer"：补考熔断，推到明日 0 点再复习，lapses+1，不写 StudyLog
// - mode="learn" 且非 correct：学到一半退出，只写 StudyLog，不建进度（词仍是新词）
// strict 优先取客户端会话快照（body.strict），为 null 时回退全局开关
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });

  const {
    wordId,
    mode,
    result,
    hadFailure = false,
    recoveryPass = false,
    attempt = null,
    practice = false,
    strict: strictSnapshot = null,
  } = await req.json().catch(() => ({}));
  const validModes: ProgressMode[] = ["learn", "check-spell", "check-choice"];
  const validResults: ProgressResult[] = ["correct", "wrong", "giveup", "defer"];
  if (
    !wordId ||
    !validModes.includes(mode) ||
    !validResults.includes(result) ||
    typeof hadFailure !== "boolean" ||
    typeof recoveryPass !== "boolean" ||
    typeof practice !== "boolean" ||
    (strictSnapshot !== null && typeof strictSnapshot !== "boolean") ||
    (attempt !== null && typeof attempt !== "string")
  ) {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  // 只记录非正确作答的实际拼写内容（供学习报告分析错因），截断防滥用
  const attemptText = result === "correct" || typeof attempt !== "string" ? null : attempt.trim().slice(0, 100) || null;

  // 单词须存在且所在书对用户可见/在学（一次查询搞定）
  const word = await prisma.word.findFirst({
    where: {
      id: wordId,
      unit: { book: { OR: [bookVisibleWhere(user.id), bookEnrolledWhere(user.id)] } },
    },
    select: { id: true },
  });
  if (!word) {
    const exists = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
    return exists
      ? NextResponse.json({ error: "该单词书对你不可见" }, { status: 403 })
      : NextResponse.json({ error: "单词不存在" }, { status: 404 });
  }

  const existing = await prisma.wordProgress.findUnique({
    where: { userId_wordId: { userId: user.id, wordId } },
  });

  // 补考熔断：推到明日再复习；没有进度记录说明词还没学过，直接忽略
  if (result === "defer") {
    if (!existing) return NextResponse.json({ ok: true, deferred: false });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    await prisma.wordProgress.update({
      where: { userId_wordId: { userId: user.id, wordId } },
      data: { nextReviewAt: tomorrow, lastResult: "giveup", lapses: { increment: 1 } },
    });
    return NextResponse.json({ ok: true, deferred: true, nextReviewAt: tomorrow });
  }

  // 自由练习：只留学习记录，不动调度（不晋级、不改 nextReviewAt、不计 reps/lapses）
  if (practice) {
    await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result, attempt: attemptText } });
    return NextResponse.json({ ok: true, practice: true });
  }

  const correct = result === "correct";

  // 学新词失败/放弃：只留学习记录，不建进度，词留在新词池
  if (mode === "learn" && !correct) {
    await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result, attempt: attemptText } });
    return NextResponse.json({ ok: true });
  }

  // strict 快照优先（客户端会话开始时读取），null 回退全局开关
  const strictOn = typeof strictSnapshot === "boolean" ? strictSnapshot : await isStrictCheck();
  const strict = strictOn && mode.startsWith("check");
  const decision = decideProgress({ existing, mode, result, strict, hadFailure, recoveryPass });

  // recoveryPass（补考中间次）的 correct 不计 reps
  const countRep = correct && !recoveryPass;

  await prisma.wordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    create: {
      userId: user.id,
      wordId,
      stage: decision.stage,
      nextReviewAt: decision.nextReviewAt,
      lastResult: result,
      spellPassed: decision.spellPassed,
      choicePassed: decision.choicePassed,
      reps: countRep ? 1 : 0,
      lapses: correct ? 0 : 1,
    },
    update: {
      stage: decision.stage,
      nextReviewAt: decision.nextReviewAt,
      lastResult: result,
      spellPassed: decision.spellPassed,
      choicePassed: decision.choicePassed,
      reps: { increment: countRep ? 1 : 0 },
      lapses: { increment: correct ? 0 : 1 },
    },
  });

  await prisma.studyLog.create({ data: { userId: user.id, wordId, mode, result, attempt: attemptText } });

  return NextResponse.json({ ok: true, stage: decision.stage, nextReviewAt: decision.nextReviewAt });
}
