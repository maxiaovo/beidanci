import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DeepSeekRequestError, withWritingAiLock } from "@/lib/deepseek-client";
import { getSessionUser, isParent } from "@/lib/session";
import { generateTaskHints } from "@/lib/writing-ai";
import { getWritingContext } from "@/lib/writing-data";
import { parseJson, type WritingFeedback, type WritingPrompt } from "@/lib/writing-types";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  if (isParent(user)) return NextResponse.json({ error: "家长账号无学习权限" }, { status: 403 });
  const { id } = await ctx.params;
  const task = await prisma.writingTask.findFirst({
    where: { id, session: { userId: user.id }, status: "active" },
    include: { attempts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!task) return NextResponse.json({ error: "任务不存在或已经完成" }, { status: 404 });
  const level = Math.min(3, task.hintLevel + 1);
  let prompt = parseJson<WritingPrompt>(task.prompt, { instruction: "" });
  let help: { keywords: string[]; frame: string; modelAnswer: string; guidedSteps: string[] };
  const latest = task.attempts[0] ? parseJson<WritingFeedback | null>(task.attempts[0].feedback, null) : null;
  try {
    if (latest) {
      help = { ...latest.hints, modelAnswer: latest.modelAnswer };
    } else if (prompt.help) {
      help = {
        keywords: prompt.help.keywords ?? [],
        frame: prompt.help.frame ?? "",
        modelAnswer: prompt.help.modelAnswer ?? "",
        guidedSteps: prompt.help.guidedSteps ?? [],
      };
    } else {
      const context = await getWritingContext(user.id);
      help = await withWritingAiLock(user.id, () => generateTaskHints(prompt, context));
      prompt = { ...prompt, help };
    }
    await prisma.writingTask.update({ where: { id }, data: { hintLevel: level, prompt: JSON.stringify(prompt) } });
    return NextResponse.json({
      level,
      hint: level === 1
        ? { keywords: help.keywords }
        : level === 2
          ? { keywords: help.keywords, frame: help.frame }
          : help,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 服务暂时不可用";
    const status = error instanceof DeepSeekRequestError && message.includes("正在处理") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
