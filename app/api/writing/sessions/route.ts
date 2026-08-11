import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DeepSeekRequestError, withWritingAiLock } from "@/lib/deepseek-client";
import { getSessionUser, isParent } from "@/lib/session";
import { generateImitation, generateReviewPrompts, generateTopics } from "@/lib/writing-ai";
import { getWritingContext, getWritingOverview } from "@/lib/writing-data";
import type { WritingPrompt } from "@/lib/writing-types";

const MODES = ["diagnostic", "topic", "generated", "free", "translation", "imitation", "review"];

function aiError(error: unknown) {
  // 409 是 withWritingAiLock 的固定提示，可安全展示；其余错误细节不外泄，只记服务端日志
  if (error instanceof DeepSeekRequestError && error.message.includes("正在处理")) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  console.error("写作会话创建失败:", error);
  return NextResponse.json({ error: "AI 服务暂时不可用，请稍后重试" }, { status: 502 });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "";
  if (!MODES.includes(mode)) return NextResponse.json({ error: "练习模式无效" }, { status: 400 });

  const [overview, context] = await Promise.all([getWritingOverview(user.id), getWritingContext(user.id)]);
  if (mode !== "diagnostic" && mode !== "review" && overview.review.required) {
    return NextResponse.json({ error: "请先完成今天的写作复练", review: overview.review }, { status: 409 });
  }
  if (mode !== "diagnostic" && !overview.profile) {
    return NextResponse.json({ error: "请先建立写作档案" }, { status: 409 });
  }

  try {
    if (mode === "generated") {
      const topics = await withWritingAiLock(user.id, () => generateTopics(context));
      return NextResponse.json({ topics });
    }

    if (mode === "review") {
      if (overview.review.sessionId) return NextResponse.json({ sessionId: overview.review.sessionId, resumed: true });
      const completedToday = !overview.review.required && overview.review.dueTotal > 0;
      if (completedToday || overview.review.dueTotal === 0) return NextResponse.json({ error: "今天没有待复练错点" }, { status: 409 });
      const items = await prisma.writingMemoryItem.findMany({
        where: { userId: user.id, status: "active", nextReviewAt: { lte: new Date() } },
        orderBy: [{ nextReviewAt: "asc" }, { lapses: "desc" }],
        take: 5,
        select: { id: true, category: true, summary: true, exampleBefore: true, exampleAfter: true },
      });
      const prompts = await withWritingAiLock(user.id, () => generateReviewPrompts(items, context));
      const session = await prisma.writingSession.create({
        data: {
          userId: user.id,
          kind: "review",
          mode: "review",
          title: `今日错点复练（${prompts.length}）`,
          target: JSON.stringify({ memoryIds: items.map((item) => item.id) }),
          tasks: {
            create: prompts.map((prompt, index) => ({
              orderIndex: index,
              type: index % 2 === 0 ? "translation" : "correction",
              prompt: JSON.stringify(prompt),
              focus: JSON.stringify([items[index]]),
            })),
          },
        },
      });
      return NextResponse.json({ sessionId: session.id }, { status: 201 });
    }

    if (mode === "diagnostic") {
      await prisma.writingProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
      const diagnosticPrompts: WritingPrompt[] = [
        { instruction: "用一个完整英文句子介绍你平时放学或下班后常做的一件事。" },
        { instruction: "用英文写一句话，说明你昨天遇到的一件小事以及你的感受。" },
        { instruction: "用 2–3 个英文句子表达：你想改善一个什么习惯，为什么，以及准备怎么做。" },
      ];
      const session = await prisma.writingSession.create({
        data: {
          userId: user.id,
          kind: "diagnostic",
          mode: "diagnostic",
          title: "写作水平摸底",
          tasks: { create: diagnosticPrompts.map((prompt, index) => ({ orderIndex: index, type: "sentence", prompt: JSON.stringify(prompt) })) },
        },
      });
      return NextResponse.json({ sessionId: session.id }, { status: 201 });
    }

    let prompt: WritingPrompt;
    let type = "sentence";
    let title = "自由写一句";
    let topic = "";
    const genre = typeof body.genre === "string" ? body.genre.trim().slice(0, 80) : "";
    if (mode === "topic") {
      topic = typeof body.topic === "string" ? body.topic.trim() : "";
      if (!topic || topic.length > 200) return NextResponse.json({ error: "题目需为 1–200 字" }, { status: 400 });
      const length = typeof body.length === "string" ? body.length.trim().slice(0, 80) : "1–3 句";
      prompt = { instruction: topic, length };
      type = /词|段|篇|essay|article/i.test(length) ? "article" : "sentence";
      title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 100) : topic.slice(0, 40);
    } else if (mode === "free") {
      prompt = { instruction: "写下你现在最想用英语表达的一句话。内容由你决定，先准确表达真实想法。" };
    } else if (mode === "translation") {
      const session = await prisma.writingSession.create({
        data: {
          userId: user.id,
          kind: "practice",
          mode,
          title: "从中文想法开始",
          messages: { create: { role: "assistant", content: "你今天最想表达、讲述或告诉别人什么？用中文说就可以。" } },
        },
      });
      return NextResponse.json({ sessionId: session.id }, { status: 201 });
    } else {
      const imitation = await withWritingAiLock(user.id, () => generateImitation(context));
      prompt = imitation;
      title = "示范仿写";
      type = "imitation";
    }

    const session = await prisma.writingSession.create({
      data: {
        userId: user.id,
        kind: "practice",
        mode,
        title,
        topic,
        genre,
        target: JSON.stringify({ length: body.length ?? "" }),
        tasks: { create: { orderIndex: 0, type, prompt: JSON.stringify(prompt) } },
      },
    });
    return NextResponse.json({ sessionId: session.id }, { status: 201 });
  } catch (error) {
    return aiError(error);
  }
}
