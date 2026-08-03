import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DeepSeekRequestError, withWritingAiLock } from "@/lib/deepseek-client";
import { getSessionUser, isParent } from "@/lib/session";
import { continueTranslationChat } from "@/lib/writing-ai";
import { getWritingContext } from "@/lib/writing-data";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 1000) return NextResponse.json({ error: "消息需为 1–1000 字" }, { status: 400 });
  const session = await prisma.writingSession.findFirst({
    where: { id, userId: user.id, mode: "translation", status: "active" },
    include: { messages: { orderBy: { createdAt: "asc" } }, tasks: { select: { id: true } } },
  });
  if (!session) return NextResponse.json({ error: "对话练习不存在" }, { status: 404 });
  if (session.tasks.length) return NextResponse.json({ error: "中文句子已经生成，请开始翻译" }, { status: 409 });
  const turn = session.messages.filter((message) => message.role === "user").length + 1;
  try {
    const context = await getWritingContext(user.id);
    const chat = await withWritingAiLock(user.id, () => continueTranslationChat({
      turn,
      context,
      messages: [...session.messages.map((message) => ({ role: message.role, content: message.content })), { role: "user", content }],
    }));
    const ready = chat.ready && chat.chineseSentences.length > 0;
    await prisma.$transaction(async (tx) => {
      await tx.writingMessage.createMany({ data: [
        { sessionId: id, role: "user", content },
        { sessionId: id, role: "assistant", content: chat.reply },
      ] });
      if (ready) {
        await tx.writingTask.create({
          data: {
            sessionId: id,
            orderIndex: 0,
            type: "translation",
            prompt: JSON.stringify({ instruction: "把下面的真实想法写成自然、准确的英文。", chinese: chat.chineseSentences.join("\n") }),
          },
        });
      }
    });
    return NextResponse.json({ reply: chat.reply, ready, chineseSentences: ready ? chat.chineseSentences : [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    const status = error instanceof DeepSeekRequestError && message.includes("正在处理") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
