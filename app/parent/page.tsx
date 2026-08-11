"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ParentWritingPanel from "@/components/ParentWritingPanel";
import ParentReportPanel from "@/components/ParentReportPanel";

interface ChildRow {
  id: string;
  username: string;
  avatarUrl: string | null;
  dailyNewTarget: number;
  dailyReviewTarget: number;
  recoveryCorrectTarget: number;
  cyclicRecovery: boolean;
  todayLogs: number;
  totalLogs: number;
  accuracy: number | null;
  dueCount: number;
  learnedCount: number;
  streak: number;
}

interface LogRow {
  id: string;
  word: string;
  meaningCn: string;
  mode: string;
  result: string;
  createdAt: string;
}

interface SkipRow {
  id: string;
  module: string;
  count: number;
  createdAt: string;
}

interface ChildMessage {
  id: string;
  userId: string;
  text: string;
  trigger: string; // start | minutes | word
  triggerValue: number | null;
  validUntil: string;
  createdAt: string;
}

const MODE_LABEL: Record<string, string> = {
  learn: "背诵",
  "check-spell": "拼写检查",
  "check-choice": "选择检查",
};
const RESULT_LABEL: Record<string, string> = {
  correct: "✓ 正确",
  wrong: "✗ 错误",
  giveup: "放弃",
};

export default function ParentPage() {
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [selected, setSelected] = useState<ChildRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [skips, setSkips] = useState<SkipRow[]>([]);
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [recoveryCorrectTarget, setRecoveryCorrectTarget] = useState(1);
  const [cyclicRecovery, setCyclicRecovery] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  // 切换孩子时记录区的加载态，避免标题已换、记录仍是上一个孩子的
  const [logsLoading, setLogsLoading] = useState(false);
  // 留言
  const [msgList, setMsgList] = useState<ChildMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgTrigger, setMsgTrigger] = useState("start");
  const [msgTriggerValue, setMsgTriggerValue] = useState(5);
  const [msgValidDays, setMsgValidDays] = useState(7);
  const [msgMsg, setMsgMsg] = useState("");
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/parent/children").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.push("/");
      const d = await r.json();
      setChildren(d.children);
    });
  }, [router]);

  useEffect(load, [load]);

  // 孩子列表变化后，若未选中或选中的孩子已不存在，自动选中第一个（配合顶部孩子标签页）
  useEffect(() => {
    if (children && children.length > 0 && (!selected || !children.some((c) => c.id === selected.id))) {
      selectChild(children[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  const loadMessages = useCallback((userId: string) => {
    if (!userId) {
      setMsgList([]);
      return;
    }
    fetch(`/api/parent/messages?userId=${userId}`).then(async (r) => {
      if (r.ok) setMsgList((await r.json()).messages);
    });
  }, []);

  async function selectChild(u: ChildRow) {
    setSelected(u);
    setNewTarget(u.dailyNewTarget);
    setReviewTarget(u.dailyReviewTarget);
    setRecoveryCorrectTarget(u.recoveryCorrectTarget ?? 1);
    setCyclicRecovery(!!u.cyclicRecovery);
    setMsgMsg("");
    setSaveErr("");
    setLogs([]);
    setSkips([]);
    setLogsLoading(true);
    loadMessages(u.id);
    const r = await fetch(`/api/parent/children/${u.id}`);
    if (r.ok) {
      const d = await r.json();
      setLogs(d.logs);
      setSkips(d.skips ?? []);
    }
    setLogsLoading(false);
  }

  async function saveTargets() {
    if (!selected) return;
    setSaveErr("");
    const nt = Number(newTarget);
    const rt = Number(reviewTarget);
    const rc = Number(recoveryCorrectTarget);
    if (![nt, rt, rc].every((n) => Number.isFinite(n))) {
      setSaveErr("请输入有效数字");
      return;
    }
    // 夹取到合法区间（与输入框 min/max 一致）
    const clampedNew = Math.min(200, Math.max(1, Math.round(nt)));
    const clampedReview = Math.min(500, Math.max(1, Math.round(rt)));
    const clampedRecovery = Math.min(5, Math.max(1, Math.round(rc)));
    setNewTarget(clampedNew);
    setReviewTarget(clampedReview);
    setRecoveryCorrectTarget(clampedRecovery);
    const r = await fetch(`/api/parent/children/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dailyNewTarget: clampedNew,
        dailyReviewTarget: clampedReview,
        recoveryCorrectTarget: clampedRecovery,
        cyclicRecovery,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setSaveErr(d.error || "保存失败，请重试");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  async function sendMessage() {
    setMsgMsg("");
    if (!selected) return setMsgMsg("请先选择孩子");
    if (!msgText.trim()) return setMsgMsg("留言内容不能为空");
    const r = await fetch("/api/parent/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: selected.id,
        text: msgText,
        trigger: msgTrigger,
        triggerValue: msgTrigger === "start" ? undefined : msgTriggerValue,
        validDays: msgValidDays,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setMsgText("");
      setMsgMsg("✓ 已发送");
      loadMessages(selected.id);
    } else {
      setMsgMsg(d.error || "发送失败");
    }
    setTimeout(() => setMsgMsg(""), 3000);
  }

  async function deleteMessage(id: string) {
    await fetch("/api/parent/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMsgList((list) => list.filter((m) => m.id !== id));
  }

  if (!children) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <div className="max-w-[1440px] mx-auto p-6 lg:px-10 flex flex-col gap-6">
      {/* 多个孩子时，顶部孩子名标签页切换；下方详情随选中孩子刷新 */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => selectChild(u)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                selected?.id === u.id
                  ? "bg-foreground text-white font-bold"
                  : "bg-white border border-black/10 text-black/60 hover:border-accent/40 hover:text-accent"
              }`}
            >
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/avatars/${u.avatarUrl}`} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${selected?.id === u.id ? "bg-white/20 text-white" : "bg-accent text-white"}`}>
                  {u.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              {u.username}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-6 flex-wrap">
        {/* 孩子列表 */}
        <section className="flex-1 min-w-72">
          <h1 className="font-bold text-2xl mb-4">我的孩子</h1>
          {children.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-10 text-center text-black/40">
              还没有绑定孩子，去 <Link href="/me/binding" className="text-accent font-bold hover:underline">账号绑定</Link> 页输入孩子的用户名发出邀约
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[.03] text-black/60">
                  <tr>
                    <th className="text-left px-4 py-2">孩子</th>
                    <th className="text-right px-2 py-2">今日</th>
                    <th className="text-right px-2 py-2">总次数</th>
                    <th className="text-right px-2 py-2">正确率</th>
                    <th className="text-right px-2 py-2">待复习</th>
                    <th className="text-right px-2 py-2">已学词</th>
                    <th className="text-right px-4 py-2">连续天数</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => selectChild(u)}
                      className={`cursor-pointer border-t border-black/5 hover:bg-black/[.02] ${
                        selected?.id === u.id ? "bg-accent/20" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/avatars/${u.avatarUrl}`} alt="" className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-accent text-white inline-flex items-center justify-center text-xs font-bold">
                              {u.username.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          {u.username}
                        </span>
                      </td>
                      <td className="text-right px-2 py-2.5">{u.todayLogs}</td>
                      <td className="text-right px-2 py-2.5">{u.totalLogs}</td>
                      <td className="text-right px-2 py-2.5">{u.accuracy === null ? "-" : `${u.accuracy}%`}</td>
                      <td className="text-right px-2 py-2.5">{u.dueCount}</td>
                      <td className="text-right px-2 py-2.5">{u.learnedCount}</td>
                      <td className="text-right px-4 py-2.5">{u.streak} 天</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>

        {/* 孩子详情 */}
        {selected && (
          <aside className="w-full sm:w-96 shrink-0 flex flex-col gap-4">
            <div className="bg-white rounded-2xl shadow p-5">
              <h2 className="font-bold mb-1">{selected.username} 的每日任务</h2>
              <div className="flex flex-col gap-3 mt-3">
                <label className="text-sm text-black/60">
                  每日新词目标
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={newTarget}
                    onChange={(e) => setNewTarget(Number(e.target.value))}
                    className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
                  />
                </label>
                <label className="text-sm text-black/60">
                  每日复习上限
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={reviewTarget}
                    onChange={(e) => setReviewTarget(Number(e.target.value))}
                    className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
                  />
                </label>
                <label className="text-sm text-black/60">
                  补考答对次数（答错的词需累计答对几次才算过）
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={recoveryCorrectTarget}
                    onChange={(e) => setRecoveryCorrectTarget(Number(e.target.value))}
                    className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
                  />
                </label>
                <label className="text-sm text-black/60 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={cyclicRecovery}
                    onChange={(e) => setCyclicRecovery(e.target.checked)}
                    className="w-4 h-4 accent-accent"
                  />
                  循环补考（补考中再答错，已累计次数清零重计）
                </label>
                <button
                  onClick={saveTargets}
                  className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90"
                >
                  {saved ? "✓ 已保存" : "保存修改"}
                </button>
                {saveErr && <p className="text-sm text-red-500">{saveErr}</p>}
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow p-5 max-h-[50vh] overflow-y-auto">
              <h2 className="font-bold mb-3">最近记录</h2>
              {logsLoading ? (
                <p className="text-sm text-black/40">加载中…</p>
              ) : logs.length === 0 && skips.length === 0 ? (
                <p className="text-sm text-black/40">还没有学习记录</p>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  {[
                    ...logs.map((l) => ({ kind: "log" as const, ...l })),
                    ...skips.map((s) => ({ kind: "skip" as const, ...s })),
                  ]
                    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                    .map((item) =>
                      item.kind === "skip" ? (
                        <div key={item.id} className="flex items-baseline gap-2 border-b border-black/5 pb-1.5">
                          <span className="text-orange-500 font-medium">
                            {item.module === "writing"
                              ? `⚠️ 跳过了写作复练${item.count > 0 ? `（${item.count} 个错点未复练，将累积到下次）` : ""}`
                              : `⚠️ 跳过了复习${item.count > 0 ? `（${item.count} 词未复习，将累积到下次）` : ""}`}
                          </span>
                          <span className="ml-auto text-xs text-black/30">
                            {new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ) : (
                        <div key={item.id} className="flex items-baseline gap-2 border-b border-black/5 pb-1.5">
                          <span className="font-medium">{item.word}</span>
                          <span className="text-black/40 text-xs">{MODE_LABEL[item.mode] ?? item.mode}</span>
                          <span
                            className={`text-xs ${
                              item.result === "correct" ? "text-green-600" : item.result === "wrong" ? "text-red-500" : "text-black/40"
                            }`}
                          >
                            {RESULT_LABEL[item.result] ?? item.result}
                          </span>
                          <span className="ml-auto text-xs text-black/30">
                            {new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      ),
                    )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {selected && <ParentWritingPanel childId={selected.id} childName={selected.username} />}
      {selected && <ParentReportPanel key={selected.id} childId={selected.id} childName={selected.username} />}

      {/* 给孩子留言 */}
      {selected && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">给 {selected.username} 留言</h2>
            {msgMsg && <span className="text-sm text-green-600">{msgMsg}</span>}
          </div>
          <div className="flex gap-6 flex-wrap">
            {/* 新建留言 */}
            <div className="flex-1 min-w-72 flex flex-col gap-3">
              <textarea
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                rows={3}
                placeholder="想对孩子说的话…"
                className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent resize-y"
              />
              <div className="flex gap-3 flex-wrap items-end">
                <label className="text-sm text-black/60">
                  展示时机
                  <select
                    value={msgTrigger}
                    onChange={(e) => setMsgTrigger(e.target.value)}
                    className="mt-1 block border rounded-lg px-3 py-1.5 outline-none focus:ring-2 ring-accent bg-white"
                  >
                    <option value="start">开始学习时</option>
                    <option value="minutes">学习 N 分钟后</option>
                    <option value="word">学到第 N 个词时</option>
                  </select>
                </label>
                {msgTrigger !== "start" && (
                  <label className="text-sm text-black/60">
                    N =
                    <input
                      type="number"
                      min={1}
                      value={msgTriggerValue}
                      onChange={(e) => setMsgTriggerValue(Number(e.target.value))}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-20 outline-none focus:ring-2 ring-accent"
                    />
                  </label>
                )}
                <label className="text-sm text-black/60">
                  有效期（天）
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={msgValidDays}
                    onChange={(e) => setMsgValidDays(Number(e.target.value))}
                    className="mt-1 block border rounded-lg px-3 py-1.5 w-20 outline-none focus:ring-2 ring-accent"
                  />
                </label>
                <button
                  onClick={sendMessage}
                  className="bg-foreground text-white rounded-lg px-6 py-2 font-bold hover:opacity-90"
                >
                  发送留言
                </button>
              </div>
              <p className="text-xs text-black/40">有效期内，每次开始学习都会按设定的时机居中弹出。</p>
            </div>
            {/* 已有留言 */}
            <div className="flex-1 min-w-72 max-h-80 overflow-y-auto">
              {msgList.length === 0 ? (
                <p className="text-sm text-black/40">暂无留言</p>
              ) : (
                <div className="flex flex-col gap-2 text-sm">
                  {msgList.map((m) => {
                    // eslint-disable-next-line react-hooks/purity -- 渲染时判断留言是否过期，与管理页一致
                    const expired = +new Date(m.validUntil) < Date.now();
                    return (
                      <div key={m.id} className={`border rounded-xl p-3 ${expired ? "opacity-50" : ""}`}>
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-black/40">
                          <span>
                            {m.trigger === "minutes"
                              ? `学习 ${m.triggerValue} 分钟后`
                              : m.trigger === "word"
                                ? `学到第 ${m.triggerValue} 个词时`
                                : "开始学习时"}
                          </span>
                          <span>
                            {expired
                              ? "已过期"
                              : `有效至 ${new Date(m.validUntil).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                          </span>
                          <button
                            onClick={() => deleteMessage(m.id)}
                            className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
