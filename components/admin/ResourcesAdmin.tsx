"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminGet } from "./admin-utils";

interface AdminBook {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  units: number;
  sharedWithAll: boolean;
  hasCover: boolean;
  owner: { id: string; username: string };
  assignedTo: { id: string; username: string }[];
}

interface AssignUser {
  id: string;
  username: string;
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
  versionCount?: { word: number; ex1: number; ex2: number };
}

// 音频版本（管理页版本面板）
interface AudioVersion {
  id: string;
  file: string;
  voice: string;
  createdAt: string;
  active: boolean;
}

type AudioKind = "word" | "ex1" | "ex2";

// kind → AudioWord 的当前文件字段 / 文件存在标志字段
const KIND_FIELD = {
  word: ["audioWord", "fileWord"],
  ex1: ["audioEx1", "fileEx1"],
  ex2: ["audioEx2", "fileEx2"],
} as const;

// 音频资源列表每页条数
const AUDIO_PAGE_SIZE = 100;

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

export default function ResourcesAdmin() {
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [books, setBooks] = useState<AdminBook[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selBooks, setSelBooks] = useState<Set<string>>(new Set());
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [assignAllOpt, setAssignAllOpt] = useState(false);
  const [assignMsg, setAssignMsg] = useState("");
  // 词书编辑（改名 + 封皮）
  const [editBook, setEditBook] = useState<AdminBook | null>(null);
  const [editName, setEditName] = useState("");
  const [editCover, setEditCover] = useState<File | null>(null);
  const [editRemoveCover, setEditRemoveCover] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const audioPlayVersionRef = useRef(0);
  const [audioWords, setAudioWords] = useState<AudioWord[] | null>(null);
  const [audioFilter, setAudioFilter] = useState("");
  const [regenBusy, setRegenBusy] = useState<Record<string, boolean>>({});
  const [backfillMsg, setBackfillMsg] = useState("");
  // 重新生成面板：选中 (wordId, kind) 后展开临时指令 + 替代拼写输入
  const [regenPanel, setRegenPanel] = useState<{ id: string; kind: "word" | "ex1" | "ex2" } | null>(null);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [regenAltText, setRegenAltText] = useState("");
  // 待批准音频区块提示
  const [approveMsg, setApproveMsg] = useState("");
  // 音频资源列表分页（筛选变化时重置到第 1 页）
  const [audioPage, setAudioPage] = useState(1);
  // 音频版本面板：选中 (wordId, kind) 后展开历史版本列表
  const [versionsPanel, setVersionsPanel] = useState<{ id: string; kind: AudioKind } | null>(null);
  const [audioVersions, setAudioVersions] = useState<AudioVersion[] | null>(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [dlBookId, setDlBookId] = useState<string | null>(null);
  const router = useRouter();

  const audioFiltered = (audioWords ?? []).filter((w) => {
    const q = audioFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      w.text.toLowerCase().includes(q) ||
      w.phonetic.toLowerCase().includes(q) ||
      w.book.toLowerCase().includes(q) ||
      w.unit.toLowerCase().includes(q)
    );
  });
  const audioPageCount = Math.max(1, Math.ceil(audioFiltered.length / AUDIO_PAGE_SIZE));
  const audioPageSafe = Math.min(audioPage, audioPageCount);
  const audioPageItems = audioFiltered.slice(
    (audioPageSafe - 1) * AUDIO_PAGE_SIZE,
    audioPageSafe * AUDIO_PAGE_SIZE,
  );

  const load = useCallback(() => {
    adminGet("/api/admin/users", router).then(async (r) => {
      if (!r) return;
      const d = await r.json();
      setUsers(d.users);
      setLoaded(true);
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

  // 一键补齐全部缺失音频：后台按书断点续传，只生成缺失的条目
  async function backfillAllAudio() {
    setBackfillMsg("提交中…");
    try {
      const r = await fetch("/api/admin/audio/backfill", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setBackfillMsg(d.books > 0 ? `已对 ${d.books} 本书开始后台补齐，进度见导入页 / 单词书页` : "没有缺失音频");
      } else {
        setBackfillMsg(d.error || "操作失败");
      }
    } catch {
      setBackfillMsg("网络错误，请重试");
    }
    setTimeout(() => setBackfillMsg(""), 8000);
  }

  // 批准某本书批量生成音频（先解析、未批准的导入会停在 pending_audio）
  async function approveAudio(bookId: string) {
    setApproveMsg("");
    try {
      const r = await fetch("/api/admin/audio/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setApproveMsg("✓ 已批准，后台开始生成音频");
        load();
      } else {
        setApproveMsg(d.error || "操作失败");
      }
    } catch {
      setApproveMsg("网络错误，请重试");
    }
    setTimeout(() => setApproveMsg(""), 4000);
  }

  // 播放音频（加时间戳避免重新生成后命中浏览器缓存）
  function playAudio(name: string) {
    audioPlayVersionRef.current += 1;
    new Audio(`/api/audio/${name}?v=${audioPlayVersionRef.current}`).play().catch(() => {});
  }

  // 重新生成某个单词的某条音频（可带临时指令 / 替代拼写），成功后更新列表中的该行
  // 每次生成是新版本：旧版本保留，新版本自动设为当前
  async function regenAudio(
    w: AudioWord,
    kind: "word" | "ex1" | "ex2",
    instruction?: string,
    altText?: string,
  ) {
    const key = `${w.id}_${kind}`;
    setRegenBusy((s) => ({ ...s, [key]: true }));
    try {
      const r = await fetch("/api/admin/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: w.id, kind, instruction, altText }),
      });
      const d = await r.json();
      if (r.ok) {
        const regenerated = !((d.failed || []) as string[]).includes(kind);
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
                  versionCount: regenerated
                    ? { word: 0, ex1: 0, ex2: 0, ...x.versionCount, [kind]: (x.versionCount?.[kind] ?? 0) + 1 }
                    : x.versionCount,
                }
              : x,
          ),
        );
        if (regenerated && versionsPanel?.id === w.id && versionsPanel.kind === kind) {
          await fetchVersions(w.id, kind);
        }
        if (!d.ok) {
          const reasons = (d.reasons ?? {}) as Record<string, string>;
          const detail = ((d.failed || []) as string[])
            .map((k) => (reasons[k] ? `${k}（${reasons[k]}）` : k))
            .join(", ");
          alert(`${w.text} 部分音频生成失败：${detail}`);
        }
      } else {
        alert(d.error || "重新生成失败");
      }
    } finally {
      setRegenBusy((s) => ({ ...s, [key]: false }));
    }
  }

  // 拉取某单词某类音频的版本列表（版本面板展开时 / 重新生成后刷新）
  async function fetchVersions(wordId: string, kind: AudioKind) {
    const r = await fetch(`/api/admin/audio/versions?wordId=${wordId}&kind=${kind}`);
    const d = await r.json().catch(() => ({}));
    setAudioVersions(r.ok ? d.versions : []);
  }

  // 展开 / 收起版本面板
  async function toggleVersions(w: AudioWord, kind: AudioKind) {
    if (versionsPanel?.id === w.id && versionsPanel.kind === kind) {
      setVersionsPanel(null);
      setAudioVersions(null);
      return;
    }
    setVersionsPanel({ id: w.id, kind });
    setAudioVersions(null);
    await fetchVersions(w.id, kind);
  }

  // 把某个历史版本设为当前启用
  async function activateVersion(w: AudioWord, v: AudioVersion) {
    if (!versionsPanel) return;
    const kind = versionsPanel.kind;
    setVersionsBusy(true);
    try {
      const r = await fetch("/api/admin/audio/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: v.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const [fileKey, flagKey] = KIND_FIELD[kind];
        setAudioWords((list) =>
          (list ?? []).map((x) =>
            x.id === w.id ? { ...x, [fileKey]: d.active, [flagKey]: true } : x,
          ),
        );
        setAudioVersions((vs) => (vs ?? []).map((x) => ({ ...x, active: x.id === v.id })));
      } else {
        alert(d.error || "操作失败");
      }
    } finally {
      setVersionsBusy(false);
    }
  }

  // 删除一个版本（含音频文件）；删当前版本时服务端自动切到剩余最新
  async function removeVersion(w: AudioWord, v: AudioVersion) {
    if (!versionsPanel) return;
    const kind = versionsPanel.kind;
    if (!confirm(`删除「${w.text}」的这个音频版本？文件将一并删除。`)) return;
    setVersionsBusy(true);
    try {
      const r = await fetch("/api/admin/audio/versions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: v.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const [fileKey, flagKey] = KIND_FIELD[kind];
        setAudioVersions((vs) =>
          (vs ?? []).filter((x) => x.id !== v.id).map((x) => ({ ...x, active: x.file === d.active })),
        );
        setAudioWords((list) =>
          (list ?? []).map((x) =>
            x.id === w.id
              ? {
                  ...x,
                  [fileKey]: d.active,
                  [flagKey]: d.active !== null,
                  versionCount: x.versionCount
                    ? { ...x.versionCount, [kind]: Math.max(0, x.versionCount[kind] - 1) }
                    : x.versionCount,
                }
              : x,
          ),
        );
      } else {
        alert(d.error || "删除失败");
      }
    } finally {
      setVersionsBusy(false);
    }
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

  // 打开词书编辑弹窗
  function openEditBook(b: AdminBook) {
    setEditBook(b);
    setEditName(b.name);
    setEditCover(null);
    setEditRemoveCover(false);
    setEditMsg("");
  }

  // 保存词书修改：显示名（纯展示，关联走 id 不影响学习数据）+ 封皮上传/清除
  async function saveEditBook() {
    if (!editBook) return;
    setSavingEdit(true);
    setEditMsg("");
    const form = new FormData();
    if (editName.trim() && editName.trim() !== editBook.name) form.append("name", editName.trim());
    if (editCover) form.append("cover", editCover);
    if (!editCover && editRemoveCover) form.append("removeCover", "true");
    const r = await fetch(`/api/books/${editBook.id}`, { method: "PATCH", body: form });
    const d = await r.json().catch(() => ({}));
    setSavingEdit(false);
    if (r.ok) {
      setEditBook(null);
      load();
    } else {
      setEditMsg(d.error || "保存失败");
    }
  }

  if (!loaded) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <>
      {/* 图书导入入口（导入本体在 /import） */}
      <Link
        href="/import"
        className="bg-white rounded-2xl shadow p-5 flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div>
          <h2 className="font-bold text-xl">📥 导入单词书</h2>
          <p className="text-sm text-black/40 mt-1">上传 epub / 文本，AI 解析单词与例句，生成朗读音频</p>
        </div>
        <span className="text-black/30 text-2xl">›</span>
      </Link>

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

      {/* 待批准音频（导入后停在 pending_audio 的书，需管理员批准才批量生成） */}
      {books.some((b) => b.status === "pending_audio") && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">待批准音频</h2>
            {approveMsg && <span className="text-sm text-green-600">{approveMsg}</span>}
          </div>
          <p className="text-xs text-black/40 mb-3">
            这些书已解析完成但尚未生成音频。建议先在下方「音频资源」区试生成几个词试听，确认效果后再批量生成。
          </p>
          <div className="flex flex-col gap-2">
            {books
              .filter((b) => b.status === "pending_audio")
              .map((b) => (
                <div key={b.id} className="flex items-center gap-3 border rounded-xl px-3 py-2">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-xs text-black/40">
                    {b.owner.username} 的书 · {b.units} 单元
                  </span>
                  <button
                    onClick={() => approveAudio(b.id)}
                    className="ml-auto bg-foreground text-white rounded-lg px-3 py-1.5 text-sm font-bold hover:opacity-90"
                  >
                    批准生成音频
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 音频资源检查 */}
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-bold text-xl">音频资源</h2>
          <div className="flex items-center gap-3 flex-wrap">
            {audioWords &&
              audioWords.some((w) => !w.fileWord || !w.fileEx1 || !w.fileEx2) && (
                <button
                  onClick={backfillAllAudio}
                  className="border border-accent text-accent rounded-lg px-3 py-1.5 text-sm hover:bg-accent/10"
                >
                  补齐全部缺失音频
                </button>
              )}
            {backfillMsg && <span className="text-sm text-black/60">{backfillMsg}</span>}
            <input
              value={audioFilter}
              onChange={(e) => {
                setAudioFilter(e.target.value);
                setAudioPage(1);
              }}
              placeholder="筛选单词 / 音标 / 词书 / 单元"
              className="border rounded-lg px-3 py-1.5 text-sm w-72 outline-none focus:ring-2 ring-accent"
            />
          </div>
        </div>
        {!audioWords ? (
          <p className="text-sm text-black/40">加载中…</p>
        ) : (
          <>
            <p className="text-xs text-black/40 mb-2">
              共 {audioWords.length} 个单词
              {audioWords.filter((w) => !w.fileWord || !w.fileEx1 || !w.fileEx2).length > 0 &&
                `，${audioWords.filter((w) => !w.fileWord || !w.fileEx1 || !w.fileEx2).length} 个存在缺失音频`}
              ，点击 ▶ 试听，↻ 重新生成（按当前 TTS 设置与音标），版本 查看/切换/删除历史版本
            </p>
            <div className="divide-y max-h-[32rem] overflow-y-auto">
              {audioPageItems.map((w) => (
                  <Fragment key={w.id}>
                  <div className="flex items-center gap-3 py-1.5 text-sm">
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
                          onClick={() => {
                            setRegenPanel({ id: w.id, kind });
                            setRegenInstruction("");
                            setRegenAltText("");
                          }}
                          disabled={regenBusy[`${w.id}_${kind}`] || (regenPanel?.id === w.id && regenPanel?.kind === kind)}
                          title={`重新生成${label}音频`}
                          className="px-1.5 py-1 rounded text-xs hover:bg-black/10 disabled:opacity-40"
                        >
                          {regenBusy[`${w.id}_${kind}`] ? "…" : "↻"}
                        </button>
                        <button
                          onClick={() => void toggleVersions(w, kind)}
                          title={`${label}历史版本（试听 / 设为当前 / 删除）`}
                          className={`px-1.5 py-1 rounded text-xs hover:bg-black/10 ${
                            versionsPanel?.id === w.id && versionsPanel.kind === kind ? "bg-black/10" : ""
                          }`}
                        >
                          版本{w.versionCount?.[kind] ? `(${w.versionCount[kind]})` : ""}
                        </button>
                      </div>
                    ))}
                  </div>
                  {regenPanel?.id === w.id && (
                    <div className="mb-2 ml-1 mr-1 rounded-xl bg-black/[.03] p-3 flex flex-col gap-2 text-sm">
                      <div className="text-xs text-black/50">
                        重新生成「{w.text}」的
                        {regenPanel.kind === "word" ? "单词发音" : regenPanel.kind === "ex1" ? "例句1" : "例句2"}
                        （可选，留空则按当前 TTS 设置）
                      </div>
                      <label className="text-xs text-black/60">
                        替代拼写（仅影响读音，不改单词文本）
                        <input
                          value={regenAltText}
                          onChange={(e) => setRegenAltText(e.target.value)}
                          placeholder="如 co-operate → cooperate"
                          className="mt-0.5 block border rounded-lg px-2 py-1 w-full outline-none focus:ring-2 ring-accent text-sm"
                        />
                      </label>
                      <label className="text-xs text-black/60">
                        临时指令（instruction）
                        <input
                          value={regenInstruction}
                          onChange={(e) => setRegenInstruction(e.target.value)}
                          placeholder="如：用缓慢语速朗读"
                          className="mt-0.5 block border rounded-lg px-2 py-1 w-full outline-none focus:ring-2 ring-accent text-sm"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const k = regenPanel.kind;
                            void regenAudio(w, k, regenInstruction.trim() || undefined, regenAltText.trim() || undefined);
                            setRegenPanel(null);
                          }}
                          disabled={regenBusy[`${w.id}_${regenPanel.kind}`]}
                          className="bg-foreground text-white rounded-lg px-3 py-1.5 text-sm font-bold hover:opacity-90 disabled:opacity-40"
                        >
                          {regenBusy[`${w.id}_${regenPanel.kind}`] ? "生成中…" : "确认重新生成"}
                        </button>
                        <button
                          onClick={() => setRegenPanel(null)}
                          className="border rounded-lg px-3 py-1.5 text-sm text-black/60 hover:bg-black/5"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                  {versionsPanel?.id === w.id && (
                    <div className="mb-2 ml-1 mr-1 rounded-xl bg-black/[.03] p-3 text-sm">
                      <div className="text-xs text-black/50 mb-2">
                        「{w.text}」
                        {versionsPanel.kind === "word" ? "单词发音" : versionsPanel.kind === "ex1" ? "例句1" : "例句2"}
                        的历史版本（重新生成自动设为当前，可回切 / 删除）
                      </div>
                      {!audioVersions ? (
                        <p className="text-xs text-black/40">加载中…</p>
                      ) : audioVersions.length === 0 ? (
                        <p className="text-xs text-black/40">暂无版本记录</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {audioVersions.map((v) => (
                            <div key={v.id} className="flex items-center gap-2 text-xs">
                              <button
                                onClick={() => playAudio(v.file)}
                                title={v.file}
                                className="px-2 py-1 rounded bg-black/5 hover:bg-black/10"
                              >
                                ▶
                              </button>
                              <span className="text-black/60 w-20 shrink-0">{v.voice || "未知音色"}</span>
                              <span className="text-black/40">{new Date(v.createdAt).toLocaleString()}</span>
                              {v.active ? (
                                <span className="text-accent font-bold px-2">当前</span>
                              ) : (
                                <button
                                  disabled={versionsBusy}
                                  onClick={() => activateVersion(w, v)}
                                  className="border rounded px-2 py-0.5 hover:bg-black/5 disabled:opacity-40"
                                >
                                  设为当前
                                </button>
                              )}
                              <button
                                disabled={versionsBusy}
                                onClick={() => removeVersion(w, v)}
                                className="border border-red-300 text-red-500 rounded px-2 py-0.5 hover:bg-red-50 disabled:opacity-40"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  </Fragment>
                ))}
            </div>
            {audioPageCount > 1 && (
              <div className="flex items-center gap-3 mt-3 text-xs text-black/60">
                <button
                  onClick={() => setAudioPage((p) => Math.max(1, p - 1))}
                  disabled={audioPageSafe <= 1}
                  className="border rounded-lg px-2.5 py-1 hover:bg-black/5 disabled:opacity-40"
                >
                  上一页
                </button>
                <span>
                  第 {audioPageSafe} / {audioPageCount} 页
                  {audioFilter.trim() !== "" && `（筛选出 ${audioFiltered.length} 条）`}
                </span>
                <button
                  onClick={() => setAudioPage((p) => Math.min(audioPageCount, p + 1))}
                  disabled={audioPageSafe >= audioPageCount}
                  className="border rounded-lg px-2.5 py-1 hover:bg-black/5 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </section>

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
                        ` · ${b.status === "processing" ? "导入中" : b.status === "queued" ? "排队中" : b.status === "stopped" ? "已停止" : b.status === "pending_audio" ? "待批准音频" : "出错"}`}
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
                      openEditBook(b);
                    }}
                    className="ml-2 shrink-0 text-xs border rounded-lg px-2.5 py-1.5 text-black/60 hover:bg-black/[.04]"
                    title="修改显示名与封皮"
                  >
                    ✏️ 编辑
                  </button>
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

      {/* 词书编辑弹窗：显示名 + 封皮 */}
      {editBook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setEditBook(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-book-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-book-title" className="text-xl font-bold mb-1">编辑单词书</h2>
            <p className="text-xs text-black/45 mb-4">显示名只是展示层修改，不影响所有用户的学习记录与计划。</p>
            <label className="block text-sm text-black/60 mb-1">显示名</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            />
            <label className="block text-sm text-black/60 mb-1">封皮图片（jpg / png / webp，≤ 8MB）</label>
            <div className="flex items-center gap-4 mb-2">
              <span className="block h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-black/10 bg-black/5">
                {editCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(editCover)} alt="新封皮预览" className="h-full w-full object-cover" />
                ) : editBook.hasCover && !editRemoveCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/books/${editBook.id}/cover`} alt="当前封皮" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[11px] font-bold text-black/40">
                    {editName || editBook.name}
                  </span>
                )}
              </span>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    setEditCover(e.target.files?.[0] ?? null);
                    setEditRemoveCover(false);
                  }}
                  className="text-xs"
                />
                {editBook.hasCover && !editCover && (
                  <label className="flex items-center gap-1.5 text-xs text-black/60">
                    <input
                      type="checkbox"
                      checked={editRemoveCover}
                      onChange={(e) => setEditRemoveCover(e.target.checked)}
                    />
                    清除当前封皮（改用文字封面）
                  </label>
                )}
              </div>
            </div>
            {editMsg && <p className="text-sm text-red-500 mb-2">{editMsg}</p>}
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditBook(null)}
                className="rounded-lg border px-4 py-2 text-sm text-black/60 hover:bg-black/[.04]"
              >
                取消
              </button>
              <button
                onClick={saveEditBook}
                disabled={savingEdit || !editName.trim()}
                className="rounded-lg bg-foreground px-5 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40"
              >
                {savingEdit ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
