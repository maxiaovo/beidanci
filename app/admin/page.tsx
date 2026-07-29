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

interface AISettings {
  model: string;
  baseUrl: string;
  apiKey: string;
  prompt: string;
  thinking: boolean;
  overridden: { model: boolean; baseUrl: boolean; apiKey: boolean; prompt: boolean };
}

interface TTSSettings {
  provider: string; // mimo | qwen
  model: string;
  baseUrl: string;
  apiKey: string;
  voice: string;
  format: string;
  prompt: string;
  qwenMode: string;
  qwenVoice: string;
  qwenInstruct: string;
  qwenLanguage: string;
  qwenTemperature: string;
  qwenMaxTokens: string;
  overridden: Record<string, boolean>;
}

interface AudioWord {
  id: string;
  text: string;
  phonetic: string;
  book: string;
  unit: string;
  audioWord: string | null;
  audioEx1: string | null;
  audioEx2: string | null;
  fileWord: boolean;
  fileEx1: boolean;
  fileEx2: boolean;
}

interface ImportEvent {
  ts: number;
  kind: "word" | "audio" | "info";
  bookId: string;
  text: string;
  ok?: boolean;
}

interface ImportStatus {
  processing: boolean;
  queueLength: number;
  currentBook: {
    id: string;
    name: string;
    analyzeDone: number;
    analyzeTotal: number;
    audioDone: number;
    audioTotal: number;
    status: string;
  } | null;
  events: ImportEvent[];
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
  const [ai, setAi] = useState<AISettings | null>(null);
  const [aiMsg, setAiMsg] = useState("");
  const [tts, setTts] = useState<TTSSettings | null>(null);
  const [ttsMsg, setTtsMsg] = useState("");
  const [audioWords, setAudioWords] = useState<AudioWord[] | null>(null);
  const [audioFilter, setAudioFilter] = useState("");
  const [regenBusy, setRegenBusy] = useState<Record<string, boolean>>({});
  const [strict, setStrict] = useState(false);
  const [siteTitle, setSiteTitle] = useState("");
  const [hasIcon, setHasIcon] = useState(false);
  const [iconVer, setIconVer] = useState(0);
  const [siteMsg, setSiteMsg] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [dlBookId, setDlBookId] = useState<string | null>(null);
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
        setStrict(!!d.strictCheck);
        setSiteTitle(d.siteTitle ?? "");
        setHasIcon(!!d.hasSiteIcon);
        if (d.ai) setAi(d.ai);
        if (d.tts) setTts(d.tts);
      }
    });
    fetch("/api/admin/books").then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setBooks(d.books);
      }
    });
    fetch("/api/admin/audio").then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setAudioWords(d.words);
      }
    });
  }, [router]);

  useEffect(load, [load]);

  // 导入实况轮询（2s）
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/import-status");
        if (r.ok && alive) setImportStatus(await r.json());
      } catch {}
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function saveAI() {
    if (!ai) return;
    setAiMsg("");
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiModel: ai.model,
        aiBaseUrl: ai.baseUrl,
        aiApiKey: ai.apiKey,
        aiPrompt: ai.prompt,
        aiThinking: ai.thinking,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setAi(d.ai);
      setAiMsg("✓ 已保存，立即生效");
    } else {
      setAiMsg(d.error || "保存失败");
    }
    setTimeout(() => setAiMsg(""), 3000);
  }

  async function saveTTS() {
    if (!tts) return;
    setTtsMsg("");
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ttsProvider: tts.provider,
        ttsModel: tts.model,
        ttsBaseUrl: tts.baseUrl,
        ttsApiKey: tts.apiKey,
        ttsVoice: tts.voice,
        ttsFormat: tts.format,
        ttsPrompt: tts.prompt,
        ttsQwenMode: tts.qwenMode,
        ttsQwenVoice: tts.qwenVoice,
        ttsQwenInstruct: tts.qwenInstruct,
        ttsQwenLanguage: tts.qwenLanguage,
        ttsQwenTemperature: tts.qwenTemperature,
        ttsQwenMaxTokens: tts.qwenMaxTokens,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setTts(d.tts);
      setTtsMsg("✓ 已保存，立即生效");
    } else {
      setTtsMsg(d.error || "保存失败");
    }
    setTimeout(() => setTtsMsg(""), 3000);
  }

  // 播放音频（加时间戳避免重新生成后命中浏览器缓存）
  function playAudio(name: string) {
    new Audio(`/api/audio/${name}?v=${Date.now()}`).play().catch(() => {});
  }

  // 重新生成某个单词的某条音频，成功后更新列表中的该行
  async function regenAudio(w: AudioWord, kind: "word" | "ex1" | "ex2") {
    const key = `${w.id}_${kind}`;
    setRegenBusy((s) => ({ ...s, [key]: true }));
    try {
      const r = await fetch("/api/admin/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: w.id, kind }),
      });
      const d = await r.json();
      if (r.ok) {
        setAudioWords((list) =>
          (list ?? []).map((x) =>
            x.id === w.id
              ? {
                  ...x,
                  audioWord: d.audioWord,
                  audioEx1: d.audioEx1,
                  audioEx2: d.audioEx2,
                  fileWord: d.fileWord,
                  fileEx1: d.fileEx1,
                  fileEx2: d.fileEx2,
                }
              : x,
          ),
        );
        if (!d.ok) alert(`${w.text} 部分音频生成失败：${(d.failed || []).join(", ")}`);
      } else {
        alert(d.error || "重新生成失败");
      }
    } finally {
      setRegenBusy((s) => ({ ...s, [key]: false }));
    }
  }

  async function toggleStrict() {
    const nextVal = !strict;
    setStrict(nextVal);
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strictCheck: nextVal }),
    });
  }

  async function saveSite() {
    setSiteMsg("");
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteTitle }),
    });
    const d = await r.json();
    if (r.ok) {
      setSiteTitle(d.siteTitle);
      setSiteMsg("✓ 已保存");
    } else {
      setSiteMsg(d.error || "保存失败");
    }
    setTimeout(() => setSiteMsg(""), 3000);
  }

  async function uploadIcon(file: File) {
    setSiteMsg("");
    const form = new FormData();
    form.append("icon", file);
    const r = await fetch("/api/admin/site-icon", { method: "POST", body: form });
    const d = await r.json();
    if (r.ok) {
      setHasIcon(true);
      setIconVer((v) => v + 1);
      setSiteMsg("✓ 图标已更新");
    } else {
      setSiteMsg(d.error || "上传失败");
    }
    setTimeout(() => setSiteMsg(""), 3000);
  }

  async function downloadBook(b: AdminBook) {
    setDlBookId(b.id);
    try {
      const r = await fetch(`/api/admin/books/${b.id}/download`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "打包下载失败");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${b.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      // 下载完成后提示是否删除服务器端打包文件
      if (window.confirm(`「${b.name}」已下载。\n是否删除服务器上的打包文件？`)) {
        await fetch(`/api/admin/books/${b.id}/package`, { method: "DELETE" });
      }
    } finally {
      setDlBookId(null);
    }
  }

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
              <option value="admin">管理员</option>
            </select>
          </label>
          <button className="bg-foreground text-white rounded-lg px-4 py-1.5 font-bold hover:opacity-90">
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
              <button
                onClick={saveTargets}
                className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90"
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
                      {b.status !== "ready" &&
                        ` · ${b.status === "processing" ? "导入中" : b.status === "queued" ? "排队中" : b.status === "stopped" ? "已停止" : "出错"}`}
                    </span>
                    <span className="block text-xs text-black/50">
                      {b.sharedWithAll
                        ? "已分配：所有用户"
                        : b.assignedTo.length
                          ? `已分配：${b.assignedTo.map((u) => u.username).join("、")}`
                          : "未分配（仅自己可见）"}
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadBook(b);
                    }}
                    disabled={dlBookId === b.id}
                    className="ml-2 shrink-0 text-xs border rounded-lg px-2.5 py-1.5 text-black/60 hover:bg-black/[.04] disabled:opacity-40"
                    title="下载单词发音 + 例句朗读（zip）"
                  >
                    {dlBookId === b.id ? "打包中…" : "⬇ 下载资产"}
                  </button>
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
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 disabled:opacity-40"
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

      {/* 导入实况 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">导入实况</h2>
          <span className="text-sm text-black/40">
            {importStatus?.processing
              ? `正在导入「${importStatus.currentBook?.name ?? ""}」${importStatus.queueLength ? ` · 队列等待 ${importStatus.queueLength} 本` : ""}`
              : importStatus?.queueLength
                ? `队列等待 ${importStatus.queueLength} 本`
                : "当前没有导入任务"}
          </span>
        </div>
        {importStatus?.currentBook && (
          <div className="mb-4 text-sm flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <span className="w-24 text-black/50">AI 解析</span>
              <div className="flex-1 h-2 bg-black/[.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${importStatus.currentBook.analyzeTotal ? (importStatus.currentBook.analyzeDone / importStatus.currentBook.analyzeTotal) * 100 : 0}%` }}
                />
              </div>
              <span className="text-black/40 w-20 text-right">
                {importStatus.currentBook.analyzeDone}/{importStatus.currentBook.analyzeTotal} 单元
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-24 text-black/50">音频生成</span>
              <div className="flex-1 h-2 bg-black/[.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-2 transition-all"
                  style={{ width: `${importStatus.currentBook.audioTotal ? (importStatus.currentBook.audioDone / importStatus.currentBook.audioTotal) * 100 : 0}%` }}
                />
              </div>
              <span className="text-black/40 w-20 text-right">
                {importStatus.currentBook.audioDone}/{importStatus.currentBook.audioTotal} 条
              </span>
            </div>
          </div>
        )}
        <div className="flex gap-4 flex-wrap">
          {/* 已解析单词（滚动） */}
          <div className="flex-1 min-w-72">
            <div className="text-sm text-black/60 mb-2">已解析单词</div>
            <div className="border rounded-xl h-56 overflow-y-auto px-3 py-2 text-sm flex flex-col gap-1">
              {importStatus?.events.filter((e) => e.kind === "word").length ? (
                importStatus.events
                  .filter((e) => e.kind === "word")
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div key={`${e.ts}-${i}`} className="border-b border-black/5 pb-1 font-mono text-[13px]">
                      {e.text}
                    </div>
                  ))
              ) : (
                <p className="text-black/30 text-sm">暂无解析记录</p>
              )}
            </div>
          </div>
          {/* 音频生成详情（滚动） */}
          <div className="flex-1 min-w-72">
            <div className="text-sm text-black/60 mb-2">音频生成详情</div>
            <div className="border rounded-xl h-56 overflow-y-auto px-3 py-2 text-sm flex flex-col gap-1">
              {importStatus?.events.filter((e) => e.kind !== "word").length ? (
                importStatus.events
                  .filter((e) => e.kind !== "word")
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div key={`${e.ts}-${i}`} className="border-b border-black/5 pb-1 flex items-baseline gap-2">
                      {e.kind === "audio" && (
                        <span className={e.ok ? "text-green-600" : "text-red-500"}>{e.ok ? "✓" : "✗"}</span>
                      )}
                      <span className={e.kind === "info" ? "text-black/50" : ""}>{e.text}</span>
                      <span className="ml-auto text-xs text-black/30 shrink-0">
                        {new Date(e.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  ))
              ) : (
                <p className="text-black/30 text-sm">暂无音频记录</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* AI 解析设置 */}
      {ai && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">AI 解析设置</h2>
            {aiMsg && <span className="text-sm text-green-600">{aiMsg}</span>}
          </div>
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex gap-4 flex-wrap">
              <label className="text-sm text-black/60 flex-1 min-w-56">
                模型
                <input
                  value={ai.model}
                  onChange={(e) => setAi({ ...ai, model: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="deepseek-v4-flash"
                />
              </label>
              <label className="text-sm text-black/60 flex-1 min-w-56">
                Base URL
                <input
                  value={ai.baseUrl}
                  onChange={(e) => setAi({ ...ai, baseUrl: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="https://api.deepseek.com"
                />
              </label>
            </div>
            <label className="text-sm text-black/60">
              API Key
              <input
                type="text"
                value={ai.apiKey}
                onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                placeholder="sk-..."
                autoComplete="off"
              />
            </label>
            <label className="text-sm text-black/60">
              提示词（%s 为单元原始文本占位符）
              <textarea
                value={ai.prompt}
                onChange={(e) => setAi({ ...ai, prompt: e.target.value })}
                rows={10}
                className="mt-1 block border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent font-mono text-xs leading-relaxed"
              />
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
              <span className="text-black/60">思考模式</span>
              <button
                onClick={() => setAi({ ...ai, thinking: !ai.thinking })}
                className={`w-11 h-6 rounded-full relative transition-colors ${ai.thinking ? "bg-green-400" : "bg-black/20"}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    ai.thinking ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-xs text-black/40">{ai.thinking ? "已开启" : "已关闭（推荐）"}</span>
            </label>
            <button
              onClick={saveAI}
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
            >
              保存 AI 设置
            </button>
            <p className="text-xs text-black/40">
              保存后对新发起的解析调用立即生效。留空并保存可恢复为环境变量 / 默认值（默认模型 deepseek-v4-flash，思考模式关闭）。
            </p>
          </div>
        </section>
      )}

      {/* TTS 语音设置 */}
      {tts && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">TTS 语音设置</h2>
            {ttsMsg && <span className="text-sm text-green-600">{ttsMsg}</span>}
          </div>
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex gap-4 flex-wrap">
              <label className="text-sm text-black/60 flex-1 min-w-56">
                引擎（provider）
                <select
                  value={tts.provider}
                  onChange={(e) => setTts({ ...tts, provider: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono bg-white"
                >
                  <option value="mimo">mimo（小米 MiMo 云端）</option>
                  <option value="qwen">qwen（本地 Qwen3-TTS）</option>
                </select>
              </label>
              <label className="text-sm text-black/60 flex-1 min-w-56">
                Base URL
                <input
                  value={tts.baseUrl}
                  onChange={(e) => setTts({ ...tts, baseUrl: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder={tts.provider === "qwen" ? "http://localhost:8765" : "https://api.xiaomimimo.com/v1"}
                />
              </label>
              <label className="text-sm text-black/60 flex-1 min-w-56">
                {tts.provider === "qwen" ? "Token（TTS_API_TOKEN，未启用可留空）" : "API Key"}
                <input
                  type="text"
                  value={tts.apiKey}
                  onChange={(e) => setTts({ ...tts, apiKey: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder={tts.provider === "qwen" ? "可留空" : "sk-..."}
                  autoComplete="off"
                />
              </label>
            </div>
            {tts.provider === "qwen" ? (
              <>
                <div className="flex gap-4 flex-wrap">
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    模式（mode）
                    <select
                      value={tts.qwenMode}
                      onChange={(e) => setTts({ ...tts, qwenMode: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono bg-white"
                    >
                      <option value="clone">clone（克隆音色）</option>
                      <option value="custom">custom（预设说话人）</option>
                      <option value="design">design（文字描述音色）</option>
                    </select>
                  </label>
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    {tts.qwenMode === "custom" ? "预设说话人（speaker）" : "克隆音色（voice）"}
                    <input
                      value={tts.qwenVoice}
                      onChange={(e) => setTts({ ...tts, qwenVoice: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="matthew-full"
                    />
                  </label>
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    语言（language）
                    <input
                      value={tts.qwenLanguage}
                      onChange={(e) => setTts({ ...tts, qwenLanguage: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="English"
                    />
                  </label>
                </div>
                <div className="flex gap-4 flex-wrap">
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    温度（temperature，0=最稳定）
                    <input
                      value={tts.qwenTemperature}
                      onChange={(e) => setTts({ ...tts, qwenTemperature: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="0"
                    />
                  </label>
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    最大 token（max_tokens）
                    <input
                      value={tts.qwenMaxTokens}
                      onChange={(e) => setTts({ ...tts, qwenMaxTokens: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="2048"
                    />
                  </label>
                </div>
                <label className="text-sm text-black/60">
                  instruct（clone：情绪注入，可留空；design：音色描述，必填）
                  <textarea
                    value={tts.qwenInstruct}
                    onChange={(e) => setTts({ ...tts, qwenInstruct: e.target.value })}
                    rows={2}
                    className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono text-xs"
                    placeholder="留空 = 自然朗读"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="flex gap-4 flex-wrap">
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    模型
                    <input
                      value={tts.model}
                      onChange={(e) => setTts({ ...tts, model: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="mimo-v2.5-tts"
                    />
                  </label>
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    音色
                    <input
                      value={tts.voice}
                      onChange={(e) => setTts({ ...tts, voice: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="Mia"
                    />
                  </label>
                  <label className="text-sm text-black/60 flex-1 min-w-56">
                    音频格式
                    <input
                      value={tts.format}
                      onChange={(e) => setTts({ ...tts, format: e.target.value })}
                      className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                      placeholder="wav"
                    />
                  </label>
                </div>
                <label className="text-sm text-black/60">
                  发音指令（user 消息，控制语气/语速/发音风格；单词音频会在此指令后自动附带音标）
                  <textarea
                    value={tts.prompt}
                    onChange={(e) => setTts({ ...tts, prompt: e.target.value })}
                    rows={3}
                    className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono text-xs"
                    placeholder="Read the following English text clearly and naturally, at a moderate pace, for a language learner."
                  />
                </label>
              </>
            )}
            <button
              onClick={saveTTS}
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
            >
              保存 TTS 设置
            </button>
            <p className="text-xs text-black/40">
              保存后对新发起的音频生成调用立即生效。留空并保存可恢复为环境变量 / 默认值。qwen 引擎指向本地 Qwen3-TTS 服务（默认 http://localhost:8765），服务器需能访问该地址才能在线生成。
            </p>
          </div>
        </section>
      )}

      {/* 音频资源检查 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-bold text-xl">音频资源</h2>
          <input
            value={audioFilter}
            onChange={(e) => setAudioFilter(e.target.value)}
            placeholder="筛选单词 / 音标 / 词书 / 单元"
            className="border rounded-lg px-3 py-1.5 text-sm w-72 outline-none focus:ring-2 ring-accent"
          />
        </div>
        {!audioWords ? (
          <p className="text-sm text-black/40">加载中…</p>
        ) : (
          <>
            <p className="text-xs text-black/40 mb-2">
              共 {audioWords.length} 个单词
              {audioWords.filter((w) => !w.fileWord || !w.fileEx1 || !w.fileEx2).length > 0 &&
                `，${audioWords.filter((w) => !w.fileWord || !w.fileEx1 || !w.fileEx2).length} 个存在缺失音频`}
              ，点击 ▶ 试听，↻ 重新生成（按当前 TTS 设置与音标）
            </p>
            <div className="divide-y max-h-[32rem] overflow-y-auto">
              {audioWords
                .filter((w) => {
                  const q = audioFilter.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    w.text.toLowerCase().includes(q) ||
                    w.phonetic.toLowerCase().includes(q) ||
                    w.book.toLowerCase().includes(q) ||
                    w.unit.toLowerCase().includes(q)
                  );
                })
                .slice(0, 300)
                .map((w) => (
                  <div key={w.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <div className="w-52 shrink-0">
                      <span className="font-bold">{w.text}</span>
                      <span className="ml-2 text-xs text-black/40">{w.phonetic}</span>
                    </div>
                    <div className="flex-1 text-xs text-black/40 truncate">
                      {w.book} · {w.unit}
                    </div>
                    {(
                      [
                        ["word", "单词", w.audioWord, w.fileWord],
                        ["ex1", "例句1", w.audioEx1, w.fileEx1],
                        ["ex2", "例句2", w.audioEx2, w.fileEx2],
                      ] as const
                    ).map(([kind, label, file, ok]) => (
                      <div key={kind} className="flex items-center gap-0.5">
                        <button
                          disabled={!file || !ok}
                          onClick={() => file && playAudio(file)}
                          title={file ? (ok ? file : `${file}（文件缺失）`) : "未生成"}
                          className={`px-2 py-1 rounded text-xs ${
                            file && ok
                              ? "bg-black/5 hover:bg-black/10"
                              : "bg-black/5 text-red-500 opacity-60 cursor-not-allowed"
                          }`}
                        >
                          ▶ {label}
                          {file && !ok ? "（缺失）" : !file ? "（无）" : ""}
                        </button>
                        <button
                          onClick={() => regenAudio(w, kind)}
                          disabled={regenBusy[`${w.id}_${kind}`]}
                          title={`重新生成${label}音频`}
                          className="px-1.5 py-1 rounded text-xs hover:bg-black/10 disabled:opacity-40"
                        >
                          {regenBusy[`${w.id}_${kind}`] ? "…" : "↻"}
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
            {audioFilter.trim() === "" && audioWords.length > 300 && (
              <p className="text-xs text-black/40 mt-2">仅显示前 300 条，请用筛选缩小范围</p>
            )}
          </>
        )}
      </section>

      {/* 站点设置 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">站点设置</h2>
          {siteMsg && <span className="text-sm text-green-600">{siteMsg}</span>}
        </div>
        <div className="flex flex-col gap-4 max-w-3xl">
          <div className="flex gap-4 flex-wrap items-end">
            <label className="text-sm text-black/60 flex-1 min-w-56">
              网站标题
              <input
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent"
                placeholder="背单词"
              />
            </label>
            <div className="text-sm text-black/60">
              网站图标
              <div className="mt-1 flex items-center gap-3">
                <button
                  onClick={() => iconInputRef.current?.click()}
                  className="w-10 h-10 rounded-lg border-2 border-dashed border-black/20 overflow-hidden flex items-center justify-center hover:border-accent transition-colors"
                  title="点击上传图标"
                >
                  {hasIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/site-icon?v=${iconVer}`} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-black/30 text-lg">+</span>
                  )}
                </button>
                <span className="text-xs text-black/40">png / ico / svg，不超过 2MB</span>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadIcon(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <span className="text-black/60">强检查</span>
            <button
              onClick={toggleStrict}
              className={`w-11 h-6 rounded-full relative transition-colors ${strict ? "bg-green-400" : "bg-black/20"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  strict ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-black/40">
              {strict ? "已开启：拼写检查和选择检查都答对才算检查通过" : "已关闭"}
            </span>
          </label>
          <button
            onClick={saveSite}
            className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
          >
            保存站点设置
          </button>
          <p className="text-xs text-black/40">标题留空并保存可恢复默认「背单词」。图标上传后立即生效。</p>
        </div>
      </section>
    </div>
  );
}
