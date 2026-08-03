"use client";

import { useEffect, useState } from "react";

interface WritingOverview {
  profile: { abilitySummary: string; abilityBand: string; dimensions: Record<string, number>; strengths: string[]; weaknesses: string[] } | null;
  review: { dueTotal: number };
  recent: { id: string; title: string; mode: string; status: string; updatedAt: string }[];
}

interface SessionDetail {
  id: string;
  title: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
  tasks: {
    id: string;
    orderIndex: number;
    prompt: { instruction?: string; chinese?: string };
    attempts: {
      id: string;
      version: number;
      text: string;
      passed: boolean;
      feedback: {
        summary?: string;
        strengths?: string[];
        issues?: { category: string; original: string; correction: string; explanation: string }[];
        improvedVersion?: string;
      };
    }[];
  }[];
}

const LABEL: Record<string, string> = { grammar: "语法", vocabulary: "词汇", naturalness: "自然表达", clarity: "清晰度", register: "语体", spelling: "拼写标点", structure: "结构" };

export default function ParentWritingPanel({ childId, childName }: { childId: string; childName: string }) {
  const [overview, setOverview] = useState<WritingOverview | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/parent/children/${childId}/writing`)
      .then(async (r) => {
        if (!alive) return;
        setOverview(r.ok ? await r.json() : null);
        setDetail(null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [childId]);

  async function open(sessionId: string) {
    const r = await fetch(`/api/parent/children/${childId}/writing/sessions/${sessionId}`);
    if (r.ok) setDetail((await r.json()).session);
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow">
      <div className="flex items-center justify-between gap-4">
        <div><div className="text-xs font-bold uppercase tracking-wider text-accent">Writing</div><h2 className="mt-1 text-xl font-black">{childName} 的写作训练</h2></div>
        {overview && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-600">待复练 {overview.review.dueTotal}</span>}
      </div>
      {loading ? <p className="mt-5 text-sm text-black/40">加载写作记录…</p> : !overview?.profile ? <p className="mt-5 text-sm text-black/40">还没有建立写作档案</p> : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[340px_1fr]">
          <div>
            <div className="rounded-xl bg-background p-4"><div className="text-sm font-bold">当前能力</div><p className="mt-2 text-sm leading-6 text-black/60">{overview.profile.abilitySummary}</p></div>
            <h3 className="mt-5 font-bold">最近写作</h3>
            <div className="mt-2 flex max-h-96 flex-col gap-2 overflow-y-auto">{overview.recent.map((item) => <button key={item.id} onClick={() => open(item.id)} className={`rounded-xl border p-3 text-left text-sm ${detail?.id === item.id ? "border-accent bg-accent/5" : "border-black/5"}`}><b className="block truncate">{item.title || "未命名练习"}</b><span className="text-xs text-black/35">{item.status === "completed" ? "已完成" : "进行中"} · {new Date(item.updatedAt).toLocaleString("zh-CN")}</span></button>)}</div>
          </div>
          <div className="min-w-0 rounded-xl border border-black/5 p-4">
            {!detail ? <p className="py-12 text-center text-sm text-black/35">选择一条记录查看完整聊天、原文和批改</p> : <div><h3 className="text-lg font-black">{detail.title}</h3>
              {detail.messages.length > 0 && <div className="mt-4"><h4 className="text-sm font-bold">想法聊天</h4><div className="mt-2 flex flex-col gap-2">{detail.messages.map((m) => <div key={m.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-foreground text-white" : "bg-black/[.04]"}`}><b>{m.role === "user" ? "孩子" : "AI 教练"}：</b>{m.content}</div>)}</div></div>}
              <div className="mt-5 flex flex-col gap-5">{detail.tasks.map((task) => <div key={task.id} className="border-t border-black/5 pt-4"><div className="text-sm font-bold">第 {task.orderIndex + 1} 题</div><p className="mt-1 text-sm text-black/55">{task.prompt.instruction}</p>{task.prompt.chinese && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-background p-2 text-sm">{task.prompt.chinese}</p>}{task.attempts.map((attempt) => <div key={attempt.id} className="mt-3 rounded-xl bg-background p-3 text-sm"><div className="flex justify-between"><b>第 {attempt.version} 次作答</b><span className={attempt.passed ? "text-green-600" : "text-orange-600"}>{attempt.passed ? "过关" : "需改写"}</span></div><p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-base leading-7">{attempt.text}</p><p className="mt-2 text-black/60">{attempt.feedback.summary}</p>{attempt.feedback.strengths?.length ? <p className="mt-2 text-green-700">优点：{attempt.feedback.strengths.join("；")}</p> : null}{attempt.feedback.issues?.map((issue, index) => <div key={index} className="mt-2 border-l-2 border-orange-300 pl-3"><b>{LABEL[issue.category] ?? issue.category}</b>：{issue.original && <span className="text-red-500 line-through">{issue.original}</span>} {issue.correction && <span className="text-green-700">→ {issue.correction}</span>}<div className="text-black/50">{issue.explanation}</div></div>)}</div>)}</div>)}</div>
            </div>}
          </div>
        </div>
      )}
    </section>
  );
}
