"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ParentWritingPanel from "@/components/ParentWritingPanel";
import { adminGet } from "./admin-utils";

interface UserRow {
  id: string;
  username: string;
  role: string;
  parentCanLearn: boolean;
  parentId: string | null;
  avatarUrl: string | null;
  highlightColor: string | null;
  dailyNewTarget: number | null; // null = 跟随全局默认
  dailyReviewTarget: number | null;
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

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [skips, setSkips] = useState<SkipRow[]>([]); // 该用户最近的跳过复习记录
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  // 切换用户时记录区的加载态，避免标题已换、记录仍是上一个用户的
  const [logsLoading, setLogsLoading] = useState(false);
  const [hlColor, setHlColor] = useState("#e11d48");
  const [hlSaved, setHlSaved] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [createMsg, setCreateMsg] = useState("");
  const [resetPwd, setResetPwd] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  // 家长绑定孩子：选中的孩子 id 集合
  const [childSel, setChildSel] = useState<Set<string>>(new Set());
  const [bindMsg, setBindMsg] = useState("");
  const [avatarMsg, setAvatarMsg] = useState("");
  const [avatarVer, setAvatarVer] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // 角色切换结果提示（失败时展示后端 400 文案）
  const [roleMsg, setRoleMsg] = useState("");
  // 全局每日任务默认值（/api/admin/config）
  const [defNew, setDefNew] = useState(20);
  const [defReview, setDefReview] = useState(100);
  const [gNew, setGNew] = useState(20);
  const [gReview, setGReview] = useState(100);
  const [gSaved, setGSaved] = useState(false);
  const [gErr, setGErr] = useState("");
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/users", router).then(async (r) => {
      if (!r) return;
      const d = await r.json();
      setUsers(d.users);
    });
    adminGet("/api/admin/config", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      setRegOpen(d.registrationOpen);
      if (typeof d.defaultDailyNewTarget === "number") {
        setDefNew(d.defaultDailyNewTarget);
        setGNew(d.defaultDailyNewTarget);
      }
      if (typeof d.defaultDailyReviewTarget === "number") {
        setDefReview(d.defaultDailyReviewTarget);
        setGReview(d.defaultDailyReviewTarget);
      }
    });
  }, [router]);

  useEffect(load, [load]);

  async function toggleReg() {
    const next = !regOpen;
    setRegOpen(next);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationOpen: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setRegOpen(!next); // 保存失败，回滚开关
      alert("注册开关保存失败，请重试");
    }
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
    if (!window.confirm(`确定将 ${selected.username} 的密码重置为「${resetPwd}」？`)) return;
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
    // 任务量为 null 表示跟随全局默认，输入框回显当前默认值
    setNewTarget(u.dailyNewTarget ?? defNew);
    setReviewTarget(u.dailyReviewTarget ?? defReview);
    setHlColor(u.highlightColor ?? "#e11d48");
    setResetPwd("");
    setResetMsg("");
    setBindMsg("");
    setSaveErr("");
    setRoleMsg("");
    setLogs([]);
    setSkips([]);
    setLogsLoading(true);
    // 家长：回显已绑定的孩子
    setChildSel(new Set((users ?? []).filter((x) => x.parentId === u.id).map((x) => x.id)));
    const r = await fetch(`/api/admin/users/${u.id}`);
    if (r.ok) {
      const d = await r.json();
      setLogs(d.logs);
      setSkips(d.skips ?? []);
    }
    setLogsLoading(false);
  }

  // 角色切换（user ↔ parent）；失败时把后端错误文案显示出来
  async function changeRole(role: string) {
    if (!selected || role === selected.role) return;
    setRoleMsg("");
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setSelected({ ...selected, role });
      load();
    } else {
      setRoleMsg(d.error || "角色修改失败");
      setTimeout(() => setRoleMsg(""), 5000);
    }
  }

  // 学习型家长开关
  async function toggleParentCanLearn() {
    if (!selected) return;
    const next = !selected.parentCanLearn;
    setSelected({ ...selected, parentCanLearn: next });
    try {
      const r = await fetch(`/api/admin/users/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentCanLearn: next }),
      });
      if (!r.ok) throw new Error();
      load();
    } catch {
      setSelected((s) => (s ? { ...s, parentCanLearn: !next } : s)); // 保存失败，回滚开关
      alert("保存失败，请重试");
    }
  }

  // 删除用户（学习记录、词书等数据一并删除）
  async function deleteUser() {
    if (!selected) return;
    if (
      !window.confirm(
        `确定删除用户「${selected.username}」？\n该用户的学习记录、词书等数据将一并删除，且不可恢复。`,
      )
    )
      return;
    const r = await fetch(`/api/admin/users/${selected.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setSelected(null);
      load();
    } else {
      alert(d.error || "删除失败");
    }
  }

  // 保存家长与孩子的绑定关系
  async function saveBindings() {
    if (!selected) return;
    setBindMsg("");
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childIds: [...childSel] }),
    });
    const d = await r.json();
    setBindMsg(r.ok ? "✓ 绑定已保存" : d.error || "保存失败");
    if (r.ok) load();
    setTimeout(() => setBindMsg(""), 3000);
  }

  async function saveTargets() {
    if (!selected) return;
    setSaveErr("");
    const nt = Number(newTarget);
    const rt = Number(reviewTarget);
    if (![nt, rt].every((n) => Number.isFinite(n))) {
      setSaveErr("请输入有效数字");
      return;
    }
    // 夹取到合法区间（与输入框 min/max 一致）
    const clampedNew = Math.min(200, Math.max(1, Math.round(nt)));
    const clampedReview = Math.min(500, Math.max(1, Math.round(rt)));
    setNewTarget(clampedNew);
    setReviewTarget(clampedReview);
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyNewTarget: clampedNew, dailyReviewTarget: clampedReview }),
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

  // 恢复任务量为全局默认（PATCH null）
  async function restoreTarget(kind: "new" | "review") {
    if (!selected) return;
    const body = kind === "new" ? { dailyNewTarget: null } : { dailyReviewTarget: null };
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      if (kind === "new") {
        setSelected({ ...selected, dailyNewTarget: null });
        setNewTarget(defNew);
      } else {
        setSelected({ ...selected, dailyReviewTarget: null });
        setReviewTarget(defReview);
      }
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "操作失败");
    }
  }

  // 保存/清除例句高亮色；clear 为 true 时清除（恢复默认）
  async function saveHighlight(clear = false) {
    if (!selected) return;
    const r = await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlightColor: clear ? "" : hlColor }),
    });
    if (r.ok) {
      const next = clear ? null : hlColor;
      setSelected({ ...selected, highlightColor: next });
      setHlSaved(true);
      setTimeout(() => setHlSaved(false), 2000);
      load();
    }
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

  // 保存全局每日任务默认值
  async function saveGlobalTargets() {
    setGErr("");
    const nt = Math.round(Number(gNew));
    const rt = Math.round(Number(gReview));
    if (!Number.isInteger(nt) || nt < 1 || nt > 200 || !Number.isInteger(rt) || rt < 1 || rt > 500) {
      setGErr("新词目标 1-200，复习上限 1-500");
      return;
    }
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDailyNewTarget: nt, defaultDailyReviewTarget: rt }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) {
      setDefNew(d.defaultDailyNewTarget);
      setDefReview(d.defaultDailyReviewTarget);
      setGSaved(true);
      setTimeout(() => setGSaved(false), 2000);
    } else {
      setGErr(d.error || "保存失败，请重试");
    }
  }

  if (!users) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <>
      <div className="flex gap-6 flex-wrap">
        {/* 用户列表 */}
        <section className="flex-1 min-w-0">
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
                className="mt-1 block border rounded-lg px-3 py-1.5 w-36 outline-none focus:ring-2 ring-accent"
                placeholder="至少2位"
              />
            </label>
            <label className="text-sm text-black/60">
              初始密码
              <input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 block border rounded-lg px-3 py-1.5 w-36 outline-none focus:ring-2 ring-accent"
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
                <option value="parent">家长</option>
                <option value="admin">管理员</option>
              </select>
            </label>
            <button className="bg-foreground text-white rounded-lg px-4 py-1.5 font-bold hover:opacity-90">
              + 创建用户
            </button>
            {createMsg && <span className="text-sm text-green-600">{createMsg}</span>}
          </form>

          <div className="bg-white rounded-2xl shadow overflow-hidden">
            <div className="overflow-x-auto">
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
                        {u.role === "admin" && <span className="ml-1 text-xs text-black/40">(管理员)</span>}
                        {u.role === "parent" && <span className="ml-1 text-xs text-black/40">(家长)</span>}
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

          {/* 全局每日任务默认值 */}
          <div className="bg-white rounded-2xl shadow p-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold">全局每日任务默认值</h2>
              {gSaved && <span className="text-sm text-green-600">✓ 已保存</span>}
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="text-sm text-black/60">
                每日新词目标（1-200）
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={gNew}
                  onChange={(e) => setGNew(Number(e.target.value))}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-32 outline-none focus:ring-2 ring-accent"
                />
              </label>
              <label className="text-sm text-black/60">
                每日复习上限（1-500）
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={gReview}
                  onChange={(e) => setGReview(Number(e.target.value))}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-32 outline-none focus:ring-2 ring-accent"
                />
              </label>
              <button
                onClick={saveGlobalTargets}
                className="bg-foreground text-white rounded-lg px-4 py-1.5 font-bold hover:opacity-90"
              >
                保存默认值
              </button>
              {gErr && <span className="text-sm text-red-500">{gErr}</span>}
            </div>
            <p className="text-xs text-black/40 mt-2">未单独自定义任务量的用户将跟随此默认值。</p>
          </div>
        </section>

        {/* 用户详情 */}
        {selected && (
          <aside className="w-full lg:w-96 shrink-0 flex flex-col gap-4">
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
                  <span className="w-12 h-12 rounded-full bg-accent text-white inline-flex items-center justify-center text-lg font-bold">
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
              {/* 角色切换（管理员账号不显示） */}
              {selected.role !== "admin" && (
                <div className="mb-4">
                  <label className="text-sm text-black/60">
                    角色
                    <select
                      value={selected.role}
                      onChange={(e) => changeRole(e.target.value)}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent bg-white"
                    >
                      <option value="user">普通用户</option>
                      <option value="parent">家长</option>
                    </select>
                  </label>
                  {roleMsg && <p className="text-sm text-red-500 mt-1">{roleMsg}</p>}
                </div>
              )}
              {selected.role === "parent" && (
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit mb-4">
                  <span className="text-black/60">学习型家长</span>
                  <button
                    type="button"
                    onClick={toggleParentCanLearn}
                    className={`w-11 h-6 rounded-full relative transition-colors ${
                      selected.parentCanLearn ? "bg-green-400" : "bg-black/20"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        selected.parentCanLearn ? "left-[1.375rem]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-black/40">开启后该家长可自己学习</span>
                </label>
              )}
              {selected.role !== "parent" && (
                <>
                  <h2 className="font-bold mb-3">任务安排</h2>
                  <div className="flex flex-col gap-3">
                    <div>
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
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {selected.dailyNewTarget === null ? (
                          <span className="text-black/40">跟随全局默认（{defNew}）</span>
                        ) : (
                          <>
                            <span className="text-accent font-medium">已自定义</span>
                            <button
                              onClick={() => restoreTarget("new")}
                              className="underline text-black/50 hover:text-black cursor-pointer"
                            >
                              恢复默认
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
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
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        {selected.dailyReviewTarget === null ? (
                          <span className="text-black/40">跟随全局默认（{defReview}）</span>
                        ) : (
                          <>
                            <span className="text-accent font-medium">已自定义</span>
                            <button
                              onClick={() => restoreTarget("review")}
                              className="underline text-black/50 hover:text-black cursor-pointer"
                            >
                              恢复默认
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={saveTargets}
                      className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90"
                    >
                      {saved ? "✓ 已保存" : "保存修改"}
                    </button>
                    {saveErr && <p className="text-sm text-red-500">{saveErr}</p>}
                  </div>
                  <h2 className="font-bold mt-5 mb-3">例句高亮色</h2>
                  <div className="flex flex-col gap-3">
                    <label className="text-sm text-black/60">
                      高亮颜色
                      <input
                        type="color"
                        value={hlColor}
                        onChange={(e) => setHlColor(e.target.value)}
                        className="mt-1 block w-full h-9 border rounded-lg cursor-pointer"
                      />
                    </label>
                    <p className="text-xs text-black/40">该学员学习时，例句中当前单词按此颜色高亮</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveHighlight()}
                        className="flex-1 bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90"
                      >
                        {hlSaved ? "✓ 已保存" : "保存"}
                      </button>
                      <button
                        onClick={() => saveHighlight(true)}
                        className="border rounded-lg px-4 py-2 text-black/60 hover:bg-black/5"
                      >
                        清除
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-3">
                {selected.role === "parent" && (
                  <div>
                    <h2 className="font-bold mb-3">绑定孩子</h2>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {(users ?? []).filter((x) => x.role === "user").map((x) => (
                        <label key={x.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={childSel.has(x.id)}
                            onChange={(e) => {
                              const next = new Set(childSel);
                              if (e.target.checked) next.add(x.id);
                              else next.delete(x.id);
                              setChildSel(next);
                            }}
                          />
                          {x.username}
                          {x.parentId && x.parentId !== selected.id && (
                            <span className="text-xs text-black/30">(已绑定其他家长)</span>
                          )}
                        </label>
                      ))}
                      {(users ?? []).filter((x) => x.role === "user").length === 0 && (
                        <p className="text-sm text-black/40">还没有可绑定的学习者账号</p>
                      )}
                    </div>
                    <button
                      onClick={saveBindings}
                      className="mt-3 w-full bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90"
                    >
                      保存绑定
                    </button>
                    {bindMsg && <div className="text-sm text-green-600 mt-1">{bindMsg}</div>}
                  </div>
                )}
                {/* 重置密码 */}
                <div className="border-t border-black/5 pt-3">
                  <label className="text-sm text-black/60">
                    重置密码
                    <input
                      type="text"
                      value={resetPwd}
                      onChange={(e) => setResetPwd(e.target.value)}
                      placeholder="新密码（至少4位）"
                      className="mt-1 border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
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
                {/* 删除用户（管理员账号不显示） */}
                {selected.role !== "admin" && (
                  <button
                    onClick={deleteUser}
                    className="w-full border border-red-300 text-red-500 rounded-lg py-2 font-medium hover:bg-red-50"
                  >
                    删除该用户
                  </button>
                )}
              </div>
            </div>
            {selected.role !== "parent" && (
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
            )}
          </aside>
        )}
      </div>

      {selected?.role === "user" && (
        <ParentWritingPanel childId={selected.id} childName={selected.username} />
      )}
    </>
  );
}
