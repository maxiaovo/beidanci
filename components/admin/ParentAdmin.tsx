"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGet } from "./admin-utils";

interface LearnerOption {
  id: string;
  username: string;
  role: string;
}

interface AdminMessage {
  id: string;
  userId: string;
  text: string;
  trigger: string; // start | minutes | word
  triggerValue: number | null;
  validUntil: string;
  createdAt: string;
}

interface ChildRow {
  id: string;
  username: string;
  avatarUrl: string | null;
  dailyNewTarget: number;
  dailyReviewTarget: number;
  todayLogs: number;
  totalLogs: number;
  accuracy: number | null;
  dueCount: number;
  learnedCount: number;
  streak: number;
}

export default function ParentAdmin() {
  // 家长留言
  const [learners, setLearners] = useState<LearnerOption[] | null>(null);
  const [msgUserId, setMsgUserId] = useState("");
  const [msgList, setMsgList] = useState<AdminMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgTrigger, setMsgTrigger] = useState("start");
  const [msgTriggerValue, setMsgTriggerValue] = useState(5);
  const [msgValidDays, setMsgValidDays] = useState(7);
  const [msgMsg, setMsgMsg] = useState("");
  const [messageNow, setMessageNow] = useState(Date.now);
  // 孩子学习状况总览
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/users", router).then(async (r) => {
      if (!r) return;
      const d = await r.json();
      setLearners(d.users);
    });
    adminGet("/api/parent/children", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      setChildren(d.children);
    });
  }, [router]);

  useEffect(load, [load]);

  // 留言过期状态每分钟刷新一次，避免在渲染期间直接读取当前时间。
  useEffect(() => {
    const timer = window.setInterval(() => setMessageNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // ---- 家长留言 ----
  async function loadMessages(userId: string) {
    if (!userId) {
      setMsgList([]);
      return;
    }
    const r = await fetch(`/api/admin/messages?userId=${userId}`);
    if (r.ok) setMsgList((await r.json()).messages);
  }

  async function sendMessage() {
    setMsgMsg("");
    if (!msgUserId) return setMsgMsg("请先选择学习者");
    if (!msgText.trim()) return setMsgMsg("留言内容不能为空");
    const r = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: msgUserId,
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
      loadMessages(msgUserId);
    } else {
      setMsgMsg(d.error || "发送失败");
    }
    setTimeout(() => setMsgMsg(""), 3000);
  }

  async function deleteMessage(id: string) {
    await fetch("/api/admin/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMsgList((list) => list.filter((m) => m.id !== id));
  }

  if (!learners || !children) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <>
      {/* 孩子学习状况总览（管理员视角 = 全部学习者） */}
      <section>
        <h1 className="font-bold text-2xl mb-4">孩子学习状况总览</h1>
        {children.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-10 text-center text-black/40">
            还没有学习者账号
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[.03] text-black/60">
                  <tr>
                    <th className="text-left px-4 py-2">学习者</th>
                    <th className="text-right px-2 py-2">今日</th>
                    <th className="text-right px-2 py-2">总次数</th>
                    <th className="text-right px-2 py-2">正确率</th>
                    <th className="text-right px-2 py-2">待复习</th>
                    <th className="text-right px-2 py-2">已学词</th>
                    <th className="text-right px-2 py-2">连续天数</th>
                    <th className="text-right px-4 py-2">每日任务</th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((u) => (
                    <tr key={u.id} className="border-t border-black/5">
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
                      <td className="text-right px-2 py-2.5">{u.streak} 天</td>
                      <td className="text-right px-4 py-2.5 text-black/60">
                        新词 {u.dailyNewTarget} / 复习 {u.dailyReviewTarget}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 家长留言 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">家长留言</h2>
          {msgMsg && <span className="text-sm text-green-600">{msgMsg}</span>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {/* 新建留言 */}
          <div className="flex-1 min-w-72 flex flex-col gap-3">
            <label className="text-sm text-black/60">
              发给
              <select
                value={msgUserId}
                onChange={(e) => {
                  setMsgUserId(e.target.value);
                  loadMessages(e.target.value);
                }}
                className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent bg-white"
              >
                <option value="">选择学习者…</option>
                {learners.filter((u) => u.role === "user").map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            </label>
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
            {!msgUserId ? (
              <p className="text-sm text-black/40">选择学习者后查看其留言列表</p>
            ) : msgList.length === 0 ? (
              <p className="text-sm text-black/40">暂无留言</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                {msgList.map((m) => {
                  const expired = +new Date(m.validUntil) < messageNow;
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
    </>
  );
}
