"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SegmentWord from "@/components/SegmentWord";
import FitWord from "@/components/FitWord";
import ParentWritingPanel from "@/components/ParentWritingPanel";
import DailyWordManager from "@/components/DailyWordManager";
import AdminAiPrompts from "@/components/AdminAiPrompts";
import { APPEARANCE_RANGES, DEFAULT_APPEARANCE, clampPx, type LearnAppearance } from "@/lib/appearance";

interface UserRow {
  id: string;
  username: string;
  role: string;
  parentId: string | null;
  avatarUrl: string | null;
  highlightColor: string | null;
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

interface SkipRow {
  id: string;
  module: string;
  count: number;
  createdAt: string;
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
  thinking: boolean;
  overridden: { model: boolean; baseUrl: boolean; apiKey: boolean; prompt: boolean };
}

interface TTSSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
  instruction: string;
  overridden: Record<string, boolean>;
}

// 英语音色池（与 lib/settings.ts 的 EN_TTS_VOICES 保持一致；客户端组件不便直接 import 服务端模块）
const EN_TTS_VOICES_CLIENT = ["Jennifer", "Ryan", "Katerina", "Aiden"];

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
  const [tab, setTab] = useState<"manage" | "settings" | "ai-prompts">("manage"); // 页签：管理 / 设置 / AI 提示词
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [skips, setSkips] = useState<SkipRow[]>([]); // 该用户最近的跳过复习记录
  const [newTarget, setNewTarget] = useState(20);
  const [reviewTarget, setReviewTarget] = useState(100);
  const [saved, setSaved] = useState(false);
  const [hlColor, setHlColor] = useState("#e11d48");
  const [hlSaved, setHlSaved] = useState(false);
  // 学习页外观（全局设置，Setting 表）
  const [appearance, setAppearance] = useState<LearnAppearance>(DEFAULT_APPEARANCE);
  const [apprSaved, setApprSaved] = useState(false);
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
  // TTS 服务连接状态（千问 DashScope 接口探测）
  const [ttsHealth, setTtsHealth] = useState<{ state: "idle" | "checking" | "ok" | "fail"; detail: string }>({
    state: "idle",
    detail: "",
  });
  // 试听状态
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
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
  const [strict, setStrict] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false); // 允许学习者跳过复习
  // 家长留言
  const [msgUserId, setMsgUserId] = useState("");
  const [msgList, setMsgList] = useState<AdminMessage[]>([]);
  const [msgText, setMsgText] = useState("");
  const [msgTrigger, setMsgTrigger] = useState("start");
  const [msgTriggerValue, setMsgTriggerValue] = useState(5);
  const [msgValidDays, setMsgValidDays] = useState(7);
  const [msgMsg, setMsgMsg] = useState("");
  const [messageNow, setMessageNow] = useState(Date.now);
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
        setAllowSkip(!!d.allowSkipReview);
        setSiteTitle(d.siteTitle ?? "");
        setHasIcon(!!d.hasSiteIcon);
        if (d.learnAppearance) setAppearance(d.learnAppearance);
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

  // 探测 TTS 服务连接状态（按面板当前 Base URL / Token，可不先保存）
  async function checkTtsHealth(t: TTSSettings | null = tts) {
    if (!t) {
      setTtsHealth({ state: "idle", detail: "" });
      return;
    }
    setTtsHealth({ state: "checking", detail: "" });
    try {
      const r = await fetch("/api/admin/tts-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: t.baseUrl, apiKey: t.apiKey }),
      });
      const d = await r.json();
      if (r.ok && d.ok) {
        setTtsHealth({ state: "ok", detail: d.baseUrl || "" });
      } else {
        setTtsHealth({ state: "fail", detail: d.error || "连接失败" });
      }
    } catch {
      setTtsHealth({ state: "fail", detail: "连接失败" });
    }
  }

  // TTS 设置加载后自动探测一次服务连接
  useEffect(() => {
    if (!tts) return;
    const timer = window.setTimeout(() => void checkTtsHealth(tts), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tts === null]);

  // 留言过期状态每分钟刷新一次，避免在渲染期间直接读取当前时间。
  useEffect(() => {
    const timer = window.setInterval(() => setMessageNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function saveTTS() {
    if (!tts) return;
    setTtsMsg("");
    try {
      const r = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ttsBaseUrl: tts.baseUrl,
        ttsApiKey: tts.apiKey,
        ttsModel: tts.model,
        ttsVoice: tts.voice,
        ttsInstruction: tts.instruction,
      }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setTts(d.tts);
        setTtsMsg("✓ 已保存，立即生效");
        checkTtsHealth(d.tts);
      } else {
        setTtsMsg(d.error || `保存失败（HTTP ${r.status}）`);
      }
    } catch {
      setTtsMsg("保存失败：网络错误，请重试");
    }
    setTimeout(() => setTtsMsg(""), 5000);
  }

  // 试听当前音色：用面板当前（可未保存）的设置现场合成样例并播放
  async function previewVoice(kind: "word" | "sentence") {
    if (!tts || previewKey) return;
    setPreviewKey(kind);
    setTtsMsg("");
    try {
      const r = await fetch("/api/admin/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: tts.baseUrl,
          apiKey: tts.apiKey,
          model: tts.model,
          voice: tts.voice,
          kind,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setTtsMsg(d.error || "试听合成失败");
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      previewAudioRef.current?.pause();
      const a = new Audio(url);
      previewAudioRef.current = a;
      await a.play().catch(() => {});
    } catch {
      setTtsMsg("试听合成失败");
    } finally {
      setPreviewKey(null);
    }
  }

  // 播放音频（加时间戳避免重新生成后命中浏览器缓存）
  function playAudio(name: string) {
    audioPlayVersionRef.current += 1;
    new Audio(`/api/audio/${name}?v=${audioPlayVersionRef.current}`).play().catch(() => {});
  }

  // 试听指定音色（后台英语音色池中的某一个）
  async function previewVoiceByName(voice: string) {
    if (previewKey) return;
    setPreviewKey(`v-${voice}`);
    setTtsMsg("");
    try {
      const r = await fetch("/api/admin/tts-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: tts?.baseUrl,
          apiKey: tts?.apiKey,
          model: tts?.model,
          voice,
          instruction: tts?.instruction,
          kind: "word",
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setTtsMsg(d.error || "试听合成失败");
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      previewAudioRef.current?.pause();
      const a = new Audio(url);
      previewAudioRef.current = a;
      await a.play().catch(() => {});
    } catch {
      setTtsMsg("试听合成失败");
    } finally {
      setPreviewKey(null);
    }
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

  async function toggleStrict() {
    const nextVal = !strict;
    setStrict(nextVal);
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strictCheck: nextVal }),
    });
  }

  async function toggleAllowSkip() {
    const nextVal = !allowSkip;
    setAllowSkip(nextVal);
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowSkipReview: nextVal }),
    });
  }

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
    setHlColor(u.highlightColor ?? "#e11d48");
    setResetPwd("");
    setResetMsg("");
    setBindMsg("");
    // 家长：回显已绑定的孩子
    setChildSel(new Set((users ?? []).filter((x) => x.parentId === u.id).map((x) => x.id)));
    const r = await fetch(`/api/admin/users/${u.id}`);
    if (r.ok) {
      const d = await r.json();
      setLogs(d.logs);
      setSkips(d.skips ?? []);
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
    await fetch(`/api/admin/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyNewTarget: Number(newTarget), dailyReviewTarget: Number(reviewTarget) }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
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

  // 保存学习页外观（全局设置，对所有学习者生效）
  async function saveAppearance() {
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnAppearance: appearance }),
    });
    const d = await r.json();
    if (r.ok) {
      setAppearance(d.learnAppearance);
      setApprSaved(true);
      setTimeout(() => setApprSaved(false), 2000);
    }
  }

  if (!users) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <div className="max-w-[1440px] mx-auto p-6 lg:px-10 flex flex-col gap-6">
      {/* 页签：管理 / 设置 */}
      <div className="flex gap-1 bg-black/5 rounded-full px-1 py-1 w-fit text-sm">
        {([
          { v: "manage", label: "管理" },
          { v: "settings", label: "设置" },
          { v: "ai-prompts", label: "AI 提示词" },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => setTab(o.v)}
            className={`rounded-full px-4 py-1 cursor-pointer transition-colors ${
              tab === o.v ? "bg-foreground text-white" : "text-black/60 hover:text-black"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {tab === "manage" && (
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
            {selected.role !== "parent" && (
              <>
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
            </div>
          </div>
          {selected.role !== "parent" && (
          <div className="bg-white rounded-2xl shadow p-5 max-h-[50vh] overflow-y-auto">
            <h2 className="font-bold mb-3">最近记录</h2>
            {logs.length === 0 && skips.length === 0 ? (
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
      )}

      {tab === "manage" && selected?.role === "user" && (
        <ParentWritingPanel childId={selected.id} childName={selected.username} />
      )}

      {/* 家长留言 */}
      {tab === "manage" && (
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
                {(users ?? []).filter((u) => u.role === "user").map((u) => (
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
      )}

      {/* 词书分配 */}
      {tab === "manage" && (
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
      )}

      {/* 导入实况 */}
      {tab === "manage" && (
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
      )}

      {/* 待批准音频（导入后停在 pending_audio 的书，需管理员批准才批量生成） */}
      {tab === "manage" && books.some((b) => b.status === "pending_audio") && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">待批准音频</h2>
            {approveMsg && <span className="text-sm text-green-600">{approveMsg}</span>}
          </div>
          <p className="text-xs text-black/40 mb-3">
            这些书已解析完成但尚未生成音频。建议先在上方「音频资源」区试生成几个词试听，确认效果后再批量生成。
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

      {/* 外观设置 */}
      {tab === "settings" && (
      <section className="bg-white rounded-2xl shadow p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-xl">外观设置</h2>
        </div>
        <div className="flex flex-col gap-4">
          {([
            { key: "wordSizePx", label: "单词字号", unit: "px" },
            { key: "segmentSizePx", label: "词根词缀字号", unit: "px" },
            { key: "sentenceSizePx", label: "例句字号", unit: "px" },
            { key: "sentenceCnSizePx", label: "例句中文字号", unit: "px" },
            { key: "cardWidthPct", label: "卡片宽度", unit: "%" },
          ] as const).map((row) => {
            const [min, max] = APPEARANCE_RANGES[row.key];
            return (
              <label key={row.key} className="flex items-center gap-3 text-sm text-black/60 max-w-3xl">
                <span className="w-28 shrink-0">{row.label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={appearance[row.key]}
                  onChange={(e) => setAppearance({ ...appearance, [row.key]: Number(e.target.value) })}
                  className="flex-1 accent-foreground"
                />
                <span className="w-16 shrink-0 text-right text-black/80 font-medium">
                  {appearance[row.key]}
                  {row.unit}
                </span>
              </label>
            );
          })}
          <div className="flex items-center gap-3">
            <button
              onClick={saveAppearance}
              className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
            >
              {apprSaved ? "✓ 已保存" : "保存外观设置"}
            </button>
            <span className="text-xs text-black/40">全局生效：保存后对所有学习者的学习页立即生效</span>
          </div>
          {/* 实时预览：外框模拟浏览器窗口，内部白卡宽度 = 卡片宽度设置 */}
          <div className="border border-black/10 rounded-2xl bg-black/[.03] p-4 sm:p-6 overflow-hidden">
            <div
              className="bg-white rounded-3xl shadow-lg p-6 mx-auto flex flex-col items-center justify-center gap-4"
              style={{
                width: `${appearance.cardWidthPct}%`,
                maxWidth: "100%",
                minHeight: `${Math.round(appearance.wordSizePx * 3)}px`,
              }}
            >
              <div className="font-bold tracking-wide max-w-full text-center">
                <FitWord text="apple" sizePx={appearance.wordSizePx} />
              </div>
              <div className="text-black/40 text-sm">/ˈæp.l/</div>
              <SegmentWord
                segments={[
                  { part: "re", type: "prefix", meaningCn: "重复" },
                  { part: "spect", type: "root", meaningCn: "看" },
                  { part: "ful", type: "suffix", meaningCn: "充满…的" },
                ]}
                sizePx={appearance.segmentSizePx}
              />
              <div className="text-center break-all" style={{ fontSize: clampPx(appearance.sentenceSizePx) }}>
                This is an apple.
              </div>
              <div className="text-black/50 text-center" style={{ fontSize: `${appearance.sentenceCnSizePx}px` }}>
                这是一个苹果。
              </div>
            </div>
          </div>
          <p className="text-xs text-black/40">预览随滑杆实时变化（无需保存）；窄屏下字号会按视口自动缩小，与学习页一致。</p>
        </div>
      </section>
      )}

      {/* 站点设置 */}
      {tab === "settings" && (
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
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <span className="text-black/60">允许跳过复习</span>
            <button
              onClick={toggleAllowSkip}
              className={`w-11 h-6 rounded-full relative transition-colors ${allowSkip ? "bg-green-400" : "bg-black/20"}`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  allowSkip ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-black/40">
              {allowSkip ? "已开启：学习者可跳过当天复习门禁（每次跳过都会记录在案）" : "已关闭：必须先完成复习才能学新词"}
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
      )}

      {tab === "ai-prompts" && <AdminAiPrompts />}

      {/* AI 连接设置 */}
      {tab === "settings" && ai && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">AI 连接设置</h2>
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
              保存后对新发起的 AI 调用立即生效。各功能提示词请在“AI 提示词”栏目编辑和调试；连接项留空可恢复为环境变量 / 默认值。
            </p>
          </div>
        </section>
      )}

      {/* TTS 语音设置 */}
      {tab === "settings" && tts && (
        <section className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-xl">TTS 语音设置</h2>
            {ttsMsg && <span className="text-sm text-green-600">{ttsMsg}</span>}
          </div>
          <div
            className={`mb-4 flex items-center gap-3 flex-wrap rounded-xl px-4 py-2.5 text-sm ${
              ttsHealth.state === "ok"
                ? "bg-green-50 text-green-700"
                : ttsHealth.state === "fail"
                  ? "bg-red-50 text-red-600"
                  : "bg-black/5 text-black/50"
            }`}
          >
            <span className="font-bold">
              {ttsHealth.state === "checking" && "⏳ 正在检测 TTS 服务…"}
              {ttsHealth.state === "ok" && "🟢 已连接 TTS 服务"}
              {ttsHealth.state === "fail" && "🔴 未连接到 TTS 服务"}
              {ttsHealth.state === "idle" && "未检测"}
            </span>
            {ttsHealth.detail && <span className="opacity-80">{ttsHealth.detail}</span>}
            <button
              type="button"
              onClick={() => checkTtsHealth()}
              disabled={ttsHealth.state === "checking"}
              className="ml-auto underline underline-offset-2 cursor-pointer disabled:opacity-40"
            >
              重新检测
            </button>
          </div>
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex gap-4 flex-wrap">
              <label className="text-sm text-black/60 flex-1 min-w-56">
                Base URL（千问 TTS 生成端点）
                <input
                  value={tts.baseUrl}
                  onChange={(e) => setTts({ ...tts, baseUrl: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
                />
              </label>
              <label className="text-sm text-black/60 flex-1 min-w-56">
                Token（TTS_API_TOKEN，未启用可留空）
                <input
                  type="text"
                  value={tts.apiKey}
                  onChange={(e) => setTts({ ...tts, apiKey: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="可留空"
                  autoComplete="off"
                />
              </label>
            </div>
            <div className="flex gap-4 flex-wrap">
              <label className="text-sm text-black/60 flex-1 min-w-56">
                模型（model）
                <input
                  value={tts.model}
                  onChange={(e) => setTts({ ...tts, model: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="qwen3-tts-flash"
                />
              </label>
              <label className="text-sm text-black/60 flex-1 min-w-56">
                默认音色（voice，随机池见下方）
                <input
                  value={tts.voice}
                  onChange={(e) => setTts({ ...tts, voice: e.target.value })}
                  className="mt-1 block border rounded-lg px-3 py-1.5 w-full outline-none focus:ring-2 ring-accent font-mono"
                  placeholder="Jennifer"
                />
              </label>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm text-black/60 mb-2">英语音色池（合成时随机选用其一，点击试听）：</div>
                <div className="flex gap-2 flex-wrap">
                  {EN_TTS_VOICES_CLIENT.map((v) => (
                    <button
                      key={v}
                      onClick={() => previewVoiceByName(v)}
                      disabled={!!previewKey}
                      className="text-sm border border-black/15 rounded-lg px-3 py-1.5 hover:bg-black/5 disabled:opacity-50"
                      title={`试听音色 ${v}`}
                    >
                      {previewKey === `v-${v}` ? "合成中…" : `▶ ${v}`}
                    </button>
                  ))}
                  <span className="text-xs text-black/40 self-center">
                    默认音色 {tts.voice} 仅作兜底
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-black/60">试听（用默认音色）：</span>
                <button
                  onClick={() => previewVoice("word")}
                  disabled={!!previewKey}
                  className="text-sm border border-black/15 rounded-lg px-3 py-1.5 hover:bg-black/5 disabled:opacity-50"
                  title="试听单词朗读"
                >
                  {previewKey === "word" ? "合成中…" : "▶ 单词"}
                </button>
                <button
                  onClick={() => previewVoice("sentence")}
                  disabled={!!previewKey}
                  className="text-sm border border-black/15 rounded-lg px-3 py-1.5 hover:bg-black/5 disabled:opacity-50"
                  title="试听例句朗读"
                >
                  {previewKey === "sentence" ? "合成中…" : "▶ 例句"}
                </button>
              </div>
              <label className="text-sm text-black/60">
                合成指令（instruction，仅对 qwen3-tts-instruct-* 生效；qwen3-tts-flash 会忽略）
                <textarea
                  value={tts.instruction}
                  onChange={(e) => setTts({ ...tts, instruction: e.target.value })}
                  rows={2}
                  className="mt-1 block border rounded-lg px-3 py-2 w-full outline-none focus:ring-2 ring-accent resize-y text-sm"
                  placeholder="用英语教学示范朗读的语气，发音清晰、语速适中地朗读"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveTTS}
                className="bg-foreground text-white rounded-lg py-2 font-bold hover:opacity-90 w-40"
              >
                保存 TTS 设置
              </button>
              {ttsMsg && (
                <span className={`text-sm ${ttsMsg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                  {ttsMsg}
                </span>
              )}
            </div>
            <p className="text-xs text-black/40">
              保存后对新发起的音频生成调用立即生效。留空并保存可恢复为环境变量 / 默认值。TTS 走千问（DashScope）原生接口，服务端需能访问该地址才能在线生成；合成英语时会随机从上方音色池选用一个。
            </p>
          </div>
        </section>
      )}

      {tab === "manage" && <DailyWordManager title="首页每日自然单词" />}

      {/* 音频资源检查 */}
      {tab === "manage" && (
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
      )}
    </div>
  );
}
