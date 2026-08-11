"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminAiPrompts from "@/components/AdminAiPrompts";
import { adminGet } from "./admin-utils";

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

export default function AiAdmin() {
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
  const router = useRouter();

  const load = useCallback(() => {
    adminGet("/api/admin/config", router).then(async (r) => {
      if (!r || !r.ok) return;
      const d = await r.json();
      if (d.ai) setAi(d.ai);
      if (d.tts) setTts(d.tts);
    });
  }, [router]);

  useEffect(load, [load]);

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

  if (!ai && !tts) return <div className="p-10 text-center text-black/40">加载中…</div>;

  return (
    <>
      {/* AI 连接设置 */}
      {ai && (
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
              保存后对新发起的 AI 调用立即生效。各功能提示词请在下方“AI 提示词”区编辑和调试；连接项留空可恢复为环境变量 / 默认值。
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

      {/* AI 提示词 */}
      <AdminAiPrompts />
    </>
  );
}
