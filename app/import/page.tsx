"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Phase = "queued" | "uploading" | "waiting" | "processing" | "ready" | "stopped" | "error";

interface Task {
  key: string;
  name: string;
  phase: Phase;
  file?: File;
  bookName?: string; // 自定义书名（仅单文件导入时）
  bookId?: string;
  analyzeDone: number;
  analyzeTotal: number;
  audioDone: number;
  audioTotal: number;
  error?: string;
}

interface BookStatus {
  id: string;
  name: string;
  status: string;
  analyzeDone: number;
  analyzeTotal: number;
  audioDone: number;
  audioTotal: number;
}

const PHASE_LABEL: Record<Phase, string> = {
  queued: "排队等待上传",
  uploading: "上传中…",
  waiting: "排队等待处理",
  processing: "处理中",
  ready: "✓ 导入完成",
  stopped: "已停止",
  error: "导入出错",
};

// 后端书状态 → 前端任务阶段
function phaseOf(status: string): Phase {
  if (status === "queued") return "waiting";
  if (status === "processing") return "processing";
  if (status === "ready") return "ready";
  if (status === "stopped") return "stopped";
  return "error";
}

export default function ImportPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [bookName, setBookName] = useState("");
  const [users, setUsers] = useState<{ id: string; username: string }[]>([]);
  const [assignTo, setAssignTo] = useState<Set<string>>(new Set());
  const [assignAll, setAssignAll] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      const d = await r.json();
      if (!d.user) return router.push("/login");
      if (d.user.role === "parent") return router.replace("/parent");
      if (d.user.role === "admin") {
        setIsAdmin(true);
        const ur = await fetch("/api/admin/users");
        if (ur.ok) {
          const ud = await ur.json();
          setUsers(ud.users.map((u: { id: string; username: string }) => ({ id: u.id, username: u.username })));
        }
      }
      // 页面加载时列出后台仍在处理的书，刷新后也能看到进度
      const br = await fetch("/api/books");
      if (br.ok) {
        const bd = await br.json();
        const running: Task[] = bd.books
          .filter((b: BookStatus) => b.status === "processing" || b.status === "queued")
          .map((b: BookStatus) => ({
            key: b.id,
            name: b.name,
            phase: phaseOf(b.status),
            bookId: b.id,
            analyzeDone: b.analyzeDone,
            analyzeTotal: b.analyzeTotal,
            audioDone: b.audioDone,
            audioTotal: b.audioTotal,
          }));
        if (running.length) setTasks((prev) => [...running, ...prev]);
      }
    });
  }, [router]);

  // 上传队列：有排队任务且没有正在上传的，就上传下一个
  useEffect(() => {
    const next = tasks.find((t) => t.phase === "queued");
    if (!next || tasks.some((t) => t.phase === "uploading")) return;
    (async () => {
      updateTask(next.key, { phase: "uploading" });
      const form = new FormData();
      form.append("file", next.file!);
      if (next.bookName) form.append("bookName", next.bookName);
      if (isAdmin) {
        if (assignAll) form.append("assignAll", "true");
        if (assignTo.size) form.append("assignTo", JSON.stringify([...assignTo]));
      }
      try {
        const res = await fetch("/api/import", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          updateTask(next.key, { phase: "error", error: data.error || "导入失败" });
          return;
        }
        updateTask(next.key, { phase: "waiting", bookId: data.bookId });
      } catch {
        updateTask(next.key, { phase: "error", error: "网络错误" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // 轮询所有排队/处理中任务的进度
  useEffect(() => {
    if (!tasks.some((t) => t.phase === "processing" || t.phase === "waiting")) return;
    const timer = setInterval(async () => {
      const r = await fetch("/api/books");
      if (!r.ok) return;
      const d = await r.json();
      setTasks((prev) =>
        prev.map((t) => {
          if ((t.phase !== "processing" && t.phase !== "waiting") || !t.bookId) return t;
          const b = d.books.find((x: BookStatus) => x.id === t.bookId);
          if (!b) return t;
          return {
            ...t,
            phase: phaseOf(b.status),
            analyzeDone: b.analyzeDone,
            analyzeTotal: b.analyzeTotal,
            audioDone: b.audioDone,
            audioTotal: b.audioTotal,
          };
        })
      );
    }, 3000);
    return () => clearInterval(timer);
  }, [tasks]);

  function updateTask(key: string, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function stopImport(t: Task) {
    if (!t.bookId) return;
    updateTask(t.key, { phase: "stopped" });
    await fetch(`/api/books/${t.bookId}/stop`, { method: "POST" });
  }

  async function resumeImport(t: Task) {
    if (!t.bookId) return;
    const r = await fetch(`/api/books/${t.bookId}/resume`, { method: "POST" });
    if (r.ok) {
      updateTask(t.key, { phase: "waiting", error: undefined });
    } else {
      const d = await r.json().catch(() => ({}));
      updateTask(t.key, { error: d.error || "续传失败" });
    }
  }

  async function deleteBook(t: Task) {
    if (!t.bookId) {
      setTasks((prev) => prev.filter((x) => x.key !== t.key));
      return;
    }
    if (!confirm(`确定删除「${t.name}」吗？书中的单词、学习记录和音频都会删除，不可恢复。`)) return;
    const res = await fetch(`/api/books/${t.bookId}`, { method: "DELETE" });
    if (res.ok) setTasks((prev) => prev.filter((x) => x.key !== t.key));
    else alert("删除失败，请重试");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    setError("");
    const newTasks: Task[] = files.map((f, i) => ({
      key: `local-${Date.now()}-${i}`,
      name: files.length === 1 && bookName.trim()
        ? bookName.trim()
        : f.name.replace(/\.[^.]+$/, "").replace(/_/g, " "),
      bookName: files.length === 1 && bookName.trim() ? bookName.trim() : undefined,
      phase: "queued",
      file: f,
      analyzeDone: 0,
      analyzeTotal: 0,
      audioDone: 0,
      audioTotal: 0,
    }));
    setTasks((prev) => [...prev, ...newTasks]);
    setFiles([]);
    setBookName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function progressOf(t: Task): { label: string; pct: number } {
    if (t.phase === "ready") return { label: "", pct: 100 };
    if (t.audioTotal > 0) {
      return {
        label: `生成音频 ${t.audioDone}/${t.audioTotal}`,
        pct: (t.audioDone / t.audioTotal) * 100,
      };
    }
    if (t.phase === "processing" && t.analyzeTotal > 0) {
      return {
        label: `AI 分析中 ${t.analyzeDone}/${t.analyzeTotal} 单元`,
        pct: (t.analyzeDone / t.analyzeTotal) * 100,
      };
    }
    return { label: PHASE_LABEL[t.phase], pct: t.phase === "processing" ? 5 : 0 };
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="font-bold text-2xl mb-6">导入单词书</h1>

      <form onSubmit={submit} className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
        <div>
          <label className="text-sm text-black/60 block mb-1">单词文件（可多选，docx / xlsx / txt / csv）</label>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".docx,.xlsx,.xls,.txt,.csv"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:font-medium hover:file:opacity-80"
          />
          {files.length > 0 && (
            <p className="text-xs text-black/40 mt-1">已选 {files.length} 个文件，将按顺序逐个导入</p>
          )}
        </div>
        {files.length <= 1 && (
          <div>
            <label className="text-sm text-black/60 block mb-1">书名（留空则用文件名）</label>
            <input
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
              placeholder="如：Y6衔接班·科学"
              className="border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent"
            />
          </div>
        )}
        {isAdmin && users.length > 0 && (
          <div>
            <label className="text-sm text-black/60 block mb-1">分配给（管理员可选，默认仅自己可见）</label>
            <div className="border rounded-lg px-3 py-2 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={assignAll}
                  onChange={(e) => setAssignAll(e.target.checked)}
                />
                所有用户（含以后注册的）
              </label>
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assignTo.has(u.id)}
                    onChange={(e) => {
                      setAssignTo((prev) => {
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
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          disabled={!files.length}
          className="bg-foreground text-white rounded-xl py-2.5 font-bold hover:opacity-90 disabled:opacity-40"
        >
          开始导入{files.length > 1 ? `（${files.length} 本）` : ""}
        </button>
        <p className="text-xs text-black/40">
          导入后会自动分析音标、词根词缀、例句，并生成读音，词量大时需要几分钟。可离开本页，任务在后台继续。
        </p>
      </form>

      {tasks.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="font-bold text-lg">导入队列</h2>
          {tasks.map((t) => {
            const p = progressOf(t);
            return (
              <div key={t.key} className="bg-white rounded-2xl shadow p-5">
                <div className="flex items-center justify-between">
                  <div className="font-bold">{t.name}</div>
                  <div className="flex items-center gap-3">
                    <div className={`text-sm ${t.phase === "error" ? "text-red-500" : t.phase === "ready" ? "text-green-600" : "text-black/50"}`}>
                      {PHASE_LABEL[t.phase]}
                    </div>
                    {(t.phase === "processing" || t.phase === "waiting") && (
                      <button
                        onClick={() => stopImport(t)}
                        className="text-sm text-red-500 border border-red-200 rounded-lg px-2.5 py-1 hover:bg-red-50"
                      >
                        停止导入
                      </button>
                    )}
                    {(t.phase === "ready" || t.phase === "stopped" || t.phase === "error") && (
                      <>
                        {(t.phase === "stopped" || t.phase === "error") && t.bookId && (
                          <button
                            onClick={() => resumeImport(t)}
                            className="text-sm text-blue-500 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50"
                          >
                            继续导入
                          </button>
                        )}
                        <button
                          onClick={() => deleteBook(t)}
                          className="text-sm text-black/40 border border-black/10 rounded-lg px-2.5 py-1 hover:bg-black/5"
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {(t.phase === "processing" || t.phase === "uploading" || t.phase === "queued" || t.phase === "waiting") && (
                  <>
                    <div className="text-sm text-black/60 mt-2">{p.label}</div>
                    <div className="h-2 rounded-full bg-black/5 overflow-hidden mt-2">
                      <div
                        className="h-full bg-blue-400 rounded-full transition-all"
                        style={{ width: `${Math.max(p.pct, 3)}%` }}
                      />
                    </div>
                  </>
                )}
                {t.phase === "ready" && t.bookId && (
                  <div className="mt-2">
                    <Link href={`/words/${t.bookId}`} className="text-blue-500 text-sm underline">
                      查看单词书 →
                    </Link>
                    {isAdmin && (
                      <Link href="/admin#assign" className="text-blue-500 text-sm underline ml-3">
                        分配给用户 →
                      </Link>
                    )}
                  </div>
                )}
                {t.phase === "error" && (
                  <div className="text-red-500 text-sm mt-2">{t.error || "导入出错，请重试"}</div>
                )}
                {t.phase === "stopped" && (
                  <div className="text-black/40 text-sm mt-2">已停止导入，已生成的单词和音频会保留，点「继续导入」可从断点恢复。</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
