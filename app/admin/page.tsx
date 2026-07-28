"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UserRow {
  id: string;
  username: string;
  role: string;
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

interface LogRow {
  id: string;
  word: string;
  meaningCn: string;
  mode: string;
  result: string;
  createdAt: string;
}

interface AdminBook {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  units: number;
  sharedWithAll: boolean;
  owner: { id: string; username: string };
  assignedTo: { id: string; username: string }[];
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

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [saved, setSaved] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createMsg, setCreateMsg] = useState("");
  const [resetPwd, setResetPwd] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [selBooks, setSelBooks] = useState<Set<string>>(new Set());
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [assignAllOpt, setAssignAllOpt] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");
  const [avatarMsg, setAvatarMsg] = useState("");
  const [avatarVer, setAvatarVer] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const load = useCallback(() => {
    fetch("/api/admin/users").then(async (r) => {
      if (r.status === 401) return router.push("/login");
      if (r.status === 403) return router.push("/");
      const d = await r.json();
      setUsers(d.users);
    });
    fetch("/api/admin/config").then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setRegOpen(d.registrationOpen);
      }
    });
    fetch("/api/admin/books").then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setBooks(d.books);
      }
    });
  }, [router]);

  useEffect(load, [load]);

  async function assignBooks(action: "assign" | "unassign") {
    setAssignMsg("");
    const r = await fetch("/api/admin/books/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookIds: [...selBooks],
        userIds: [...selUsers],
        all: assignAllOpt,
        action,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setAssignMsg(action === "assign" ? "✓ 已分配" : "✓ 已取消分配");
      setSelBooks(new Set());
      load();
    } else {
      setAssignMsg(d.error || "操作失败");
    }
    setTimeout(() => setAssignMsg(""), 3000);
  }

  async function uploadAvatar(file: File) {
    if (!selected) return;
    setAvatarMsg("");
    const form = new FormData();
    form.append("avatar", file);
    const r = await fetch(`/api/admin/users/${selected.id}/avatar`, { method: "POST", body: form });
    const d = await r.json();
    if (r.ok) {
      setAvatarMsg("✓ 头像已更新");
      setAvatarVer((v) => v + 1);
      setSelected({ ...selected, avatarUrl: d.avatarUrl });
      load();
    } else {
      setAvatarMsg(d.error || "上传失败");
    }
    setTimeout(() => setAvatarMsg(""), 3000);
  }

  async function toggleReg() {
    const next = !regOpen;
    setRegOpen(next);
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: next }),
    });
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg("");
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    });
    const d = await r.json();
    if (r.ok) {
      setCreateMsg(`✓ 已创建用户 ${newUsername}`);
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      load();
    } else {
      setCreateMsg(d.error || "创建失败");
    }
    setTimeout(() => setCreateMsg(""), 3000);
  }

  async function resetPassword() {
    if (!selected || !resetPwd) return;
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: resetPwd }),
    });
    const d = await r.json();
    setResetMsg(r.ok ? "✓ 密码已重置" : d.error || "重置失败");
    if (r.ok) setResetPwd("");
    setTimeout(() => setResetMsg(""), 3000);
  }

  async function selectUser(u: UserRow) {
    setSelected(u);
    setNewTarget(u.dailyNewTarget);
    setReviewTarget(u.dailyReviewTarget);
    setResetPwd("");
    setResetMsg("");
    const r = await fetch(`/api/admin/users/${u.id}`);
    if (r.ok) {
      const d = await r.json();
      setLogs(d.logs);
    }
  }

  async function saveTargets() {
    if (!selected) return;
    await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyNewTarget: Number(newTarget), dailyReviewTarget: Number(reviewTarget) }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  if (!users) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex gap-6">
      {/* 用户列表 */}
      <section className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-bold text-2xl">用户管理</h1>
          {/* 注册开关 */}
          <label className="flex items-center gap-2 text-sm cursor-pointer bg-white rounded-full shadow px-4 py-2">
            <span className="text-black/60">开放注册</span>
            <button
              onClick={toggleReg}
              className={`w-11 h-6 rounded-full relative transition-colors ${regOpen ? "bg-green-400" : "bg-black/20"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  regOpen ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
          </label>
        </div>

        {/* 创建用户 */}
        <form onSubmit={createUser} className="bg-white rounded-2xl shadow p-4 mb-4 flex items-end gap-3 flex-wrap">
          <label className="text-sm text-black/60">
            用户名
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="mt-1 block border rounded-lg px-3 py-1.5 w-36 outline-none focus:ring-2 ring-[#A8D8EA]"
              placeholder="至少2位"
            />
          </label>
          <label className="text-sm text-black/60">
            初始密码
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block border rounded-lg px-3 py-1.5 w-36 outline-none focus:ring-2 ring-[#A8D8EA]"
              placeholder="至少4位"
            />
          </label>
          <label className="text-sm text-black/60">
            角色
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="mt-1 block border rounded-lg px-3 py-1.5"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <button className="bg-[#2d2a32] text-white rounded-lg px-4 py-1.5 font-bold hover:opacity-90">
            + 创建用户
          </button>
          {createMsg && <span className="text-sm text-green-600">{createMsg}</span>}
        </form>

        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[.03] text-black/60">
              <tr>
                <th className="text-left px-4 py-2">用户</th>
                <th className="text-right px-2 py-2">今日</th>
                <th className="text-right px-2 py-2">总次数</th>
                <th className="text-right px-2 py-2">正确率</th>
                <th className="text-right px-2 py-2">待复习</th>
                <th className="text-right px-2 py-2">已学词</th>
                <th className="text-right px-4 py-2">连续天数</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className={`cursor-pointer border-t border-black/5 hover:bg-black/[.02] ${
                    selected?.id === u.id ? "bg-[#A8D8EA]/20" : ""
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/avatars/${u.avatarUrl}`} alt="" className="w-6 h-6 rounded-full object-cover" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-[#A8D8EA] inline-flex items-center justify-center text-xs font-bold">
                          {u.username.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      {u.username}
                    </span>
                    {u.role === "admin" && <span className="ml-1 text-xs text-black/40">(管理员)</span>}
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
      </section>

      {/* 用户详情 */}
      {selected && (
        <aside className="w-96 shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center gap-3 mb-4">
              {selected.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/avatars/${selected.avatarUrl}?v=${avatarVer}`}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <span className="w-12 h-12 rounded-full bg-[#A8D8EA] inline-flex items-center justify-center text-lg font-bold">
                  {selected.username.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <h2 className="font-bold">{selected.username}</h2>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="text-sm text-blue-500 underline"
                >
                  更换头像
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadAvatar(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {avatarMsg && <span className="text-sm text-green-600 ml-auto">{avatarMsg}</span>}
            </div>
            <h2 className="font-bold mb-3">任务安排</h2>
            <div className="flex flex-col gap-3">
              <label className="text-sm text-black/60">
                每日新词目标
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={newTarget}
                  onChange={(e) => setNewTarget(Number(e.target.value))}
                  className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-[#A8D8EA]"
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
                  className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-[#A8D8EA]"
                />
              </label>
              <button
                onClick={saveTargets}
                className="bg-[#2d2a32] text-white rounded-lg py-2 font-bold hover:opacity-90"
              >
                {saved ? "✓ 已保存" : "保存修改"}
              </button>
              {/* 重置密码 */}
              <div className="border-t border-black/5 pt-3">
                <label className="text-sm text-black/60">
                  重置密码
                  <input
                    type="text"
                    value={resetPwd}
                    onChange={(e) => setResetPwd(e.target.value)}
                    placeholder="新密码（至少4位）"
                    className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-[#A8D8EA]"
                  />
                </label>
                <button
                  onClick={resetPassword}
                  disabled={!resetPwd}
                  className="mt-2 w-full border border-red-300 text-red-500 rounded-lg py-2 font-medium hover:bg-red-50 disabled:opacity-40"
                >
                  重置该用户密码
                </button>
                {resetMsg && <div className="text-sm text-green-600 mt-1">{resetMsg}</div>}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow p-5 max-h-[50vh] overflow-y-auto">
            <h2 className="font-bold mb-3">最近记录</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-black/40">还没有学习记录</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-baseline gap-2 border-b border-black/5 pb-1.5">
                    <span className="font-medium">{l.word}</span>
                    <span className="text-black/40 text-xs">{MODE_LABEL[l.mode] ?? l.mode}</span>
                    <span
                      className={`text-xs ${
                        l.result === "correct" ? "text-green-600" : l.result === "wrong" ? "text-red-500" : "text-black/40"
                      }`}
                    >
                      {RESULT_LABEL[l.result] ?? l.result}
                    </span>
                    <span className="ml-auto text-xs text-black/30">
                      {new Date(l.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
      </div>

      {/* 词书分配 */}
      <section id="assign" className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">词书分配</h2>
          {assignMsg && <span className="text-sm text-green-600">{assignMsg}</span>}
        </div>
        <div className="flex gap-6 flex-wrap">
          {/* 词书多选 */}
          <div className="flex-1 min-w-72">
            <div className="text-sm text-black/60 mb-2">选择词书（已选 {selBooks.size} 本）</div>
            <div className="border rounded-xl divide-y divide-black/5 max-h-72 overflow-y-auto">
              {books.length === 0 && <p className="text-sm text-black/40 p-3">还没有词书</p>}
              {books.map((b) => (
                <label key={b.id} className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-black/[.02]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selBooks.has(b.id)}
                    onChange={(e) => {
                      setSelBooks((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(b.id);
                        else next.delete(b.id);
                        return next;
                      });
                    }}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-xs text-black/40 ml-2">
                      {b.owner.username} 的书 · {b.units} 单元
                      {b.status !== "ready" && ` · ${b.status === "processing" ? "导入中" : "出错"}`}
                    </span>
                    <span className="block text-xs text-black/50">
                      {b.sharedWithAll
                        ? "已分配：所有用户"
                        : b.assignedTo.length
                          ? `已分配：${b.assignedTo.map((u) => u.username).join("、")}`
                          : "未分配（仅自己可见）"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          {/* 用户多选 + 操作 */}
          <div className="w-64 shrink-0 flex flex-col gap-3">
            <div className="text-sm text-black/60">分配给</div>
            <div className="border rounded-xl px-3 py-2 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignAllOpt}
                  onChange={(e) => setAssignAllOpt(e.target.checked)}
                />
                所有用户（含以后注册的）
              </label>
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selUsers.has(u.id)}
                    onChange={(e) => {
                      setSelUsers((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(u.id);
                        else next.delete(u.id);
                        return next;
                      });
                    }}
                  />
                  {u.username}
                </label>
              ))}
            </div>
            <button
              onClick={() => assignBooks("assign")}
              disabled={!selBooks.size || (!selUsers.size && !assignAllOpt)}
              className="bg-[#2d2a32] text-white rounded-lg py-2 font-bold hover:opacity-90 disabled:opacity-40"
            >
              分配
            </button>
            <button
              onClick={() => assignBooks("unassign")}
              disabled={!selBooks.size || (!selUsers.size && !assignAllOpt)}
              className="border border-red-300 text-red-500 rounded-lg py-2 font-medium hover:bg-red-50 disabled:opacity-40"
            >
              取消分配
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
