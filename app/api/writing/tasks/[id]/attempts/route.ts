import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DeepSeekRequestError, withWritingAiLock } from "@/lib/deepseek-client";
import { getSessionUser, isParent } from "@/lib/session";
import { evaluateWriting } from "@/lib/writing-ai";
import { needsLongerDiagnostic } from "@/lib/writing-assessment";
import { getWritingContext, recalculateWritingProfile } from "@/lib/writing-data";
import { decideWritingReview } from "@/lib/writing-scheduler";
import { parseJson, type WritingFeedback, type WritingPrompt } from "@/lib/writing-types";

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

async function finishOrExtendSession(sessionId: string, taskOrder: number) {
  const session = await prisma.writingSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  if (session.kind === "diagnostic" && taskOrder === 2) {
    const tasks = await prisma.writingTask.findMany({
      where: { sessionId, orderIndex: { lte: 2 } },
      orderBy: { orderIndex: "asc" },
      include: { attempts: { where: { passed: true }, orderBy: { version: "desc" }, take: 1 } },
    });
    const feedbacks = tasks.map((task) => parseJson<WritingFeedback | null>(task.attempts[0]?.feedback ?? "", null)).filter((item): item is WritingFeedback => !!item);
    const needsArticle = needsLongerDiagnostic(feedbacks);
    if (needsArticle) {
      await prisma.writingTask.upsert({
        where: { sessionId_orderIndex: { sessionId, orderIndex: 3 } },
        create: {
          sessionId,
          orderIndex: 3,
          type: "article",
          prompt: JSON.stringify({ instruction: "请用 60–100 个英文单词写一段短文：描述最近一次你解决小问题的经历，以及你从中学到了什么。", length: "60–100 词" }),
        },
        update: {},
      });
      return;
    }
  }
  const remaining = await prisma.writingTask.count({ where: { sessionId, status: "active" } });
  if (remaining === 0) {
    await prisma.writingSession.update({ where: { id: sessionId }, data: { status: "completed", completedAt: new Date() } });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";
  if (!text || text.length > 5000) return NextResponse.json({ error: "作文需为 1–5000 字" }, { status: 400 });
  if (!clientRequestId || clientRequestId.length > 100) return NextResponse.json({ error: "请求标识无效" }, { status: 400 });

  const duplicate = await prisma.writingAttempt.findUnique({ where: { clientRequestId } });
  if (duplicate) {
    if (duplicate.userId !== user.id || duplicate.taskId !== id) return NextResponse.json({ error: "请求标识冲突" }, { status: 409 });
    return NextResponse.json({ attempt: { ...duplicate, feedback: parseJson(duplicate.feedback, {}) }, duplicate: true });
  }

  const task = await prisma.writingTask.findFirst({
    where: { id, session: { userId: user.id } },
    include: { session: true, attempts: { orderBy: { version: "asc" } } },
  });
  if (!task) return NextResponse.json({ error: "写作任务不存在" }, { status: 404 });
  if (task.status === "passed") return NextResponse.json({ error: "这项任务已经过关" }, { status: 409 });
  const earlier = await prisma.writingTask.count({ where: { sessionId: task.sessionId, orderIndex: { lt: task.orderIndex }, status: "active" } });
  if (earlier) return NextResponse.json({ error: "请按顺序完成前面的任务" }, { status: 409 });

  const prompt = parseJson<WritingPrompt>(task.prompt, { instruction: "" });
  const focus = parseJson<unknown[]>(task.focus, []);
  try {
    const context = await getWritingContext(user.id);
    const feedback = await withWritingAiLock(user.id, () => evaluateWriting({
      text,
      prompt,
      focus,
      taskType: task.type,
      attemptNumber: task.attempts.length + 1,
      context,
    }));
    const focusResolved = focus.length === 0 || feedback.focusResolved;
    const passed = feedback.blockingIssues.length === 0 && focusResolved;
    const version = task.attempts.length + 1;
    const usedHint = task.hintLevel > 0;
    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.writingAttempt.create({
        data: {
          taskId: task.id,
          userId: user.id,
          clientRequestId,
          version,
          text,
          feedback: JSON.stringify({ ...feedback, focusResolved }),
          passed,
          usedHint,
        },
      });
      await tx.writingTask.update({
        where: { id: task.id },
        data: passed
          ? { status: "passed", completedAt: new Date() }
          : task.failedRounds + 1 >= 3
            ? { failedRounds: { increment: 1 }, hintLevel: 3 }
            : { failedRounds: { increment: 1 } },
      });
      if (version === 1 && task.session.kind !== "review" && feedback.memoryItems.length) {
        await tx.writingMemoryItem.createMany({
          data: feedback.memoryItems.map((item) => ({
            userId: user.id,
            sourceAttemptId: created.id,
            category: item.category,
            skillCode: item.skillCode,
            summary: item.summary,
            explanation: item.explanation,
            exampleBefore: item.exampleBefore,
            exampleAfter: item.exampleAfter,
            nextReviewAt: tomorrow(),
          })),
        });
      }
      if (task.session.kind === "review" && prompt.memoryId) {
        const memory = await tx.writingMemoryItem.findFirst({ where: { id: prompt.memoryId, userId: user.id } });
        if (memory) {
          const decision = decideWritingReview(memory, passed, passed && version === 1 && !usedHint);
          await tx.writingMemoryItem.update({ where: { id: memory.id }, data: decision });
        }
      }
      return created;
    });
    if (passed) await finishOrExtendSession(task.sessionId, task.orderIndex);
    await recalculateWritingProfile(user.id);
    return NextResponse.json({
      attempt: { ...attempt, feedback: { ...feedback, focusResolved } },
      passed,
      guided: !passed && task.failedRounds + 1 >= 3,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    const status = error instanceof DeepSeekRequestError && message.includes("正在处理") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
