"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regOpen, setRegOpen] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setRegOpen(d.registrationOpen))
      .catch(() => setRegOpen(true));
  }, []);

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setAvatar(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old); // 换图时释放上一个预览
      return f ? URL.createObjectURL(f) : "";
    });
  }

  // 组件卸载时释放头像预览的 objectURL
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!avatar) {
      setError("请上传头像");
      return;
    }
    setLoading(true);
    setError("");
    const form = new FormData();
    form.append("username", username);
    form.append("password", password);
    form.append("avatar", avatar);
    const res = await fetch("/api/auth/register", { method: "POST", body: form });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error || "注册失败");
    }
  }

  if (regOpen === null) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-black/40">加载中…</div>
      </div>
    );
  }

  if (regOpen === false) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-80 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2">注册已关闭</h1>
          <p className="text-sm text-black/50 mb-4">请联系管理员开通账号</p>
          <Link href="/login" className="text-blue-500 underline text-sm">返回登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-8 w-80 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-center">注册账号</h1>

        {/* 头像（必传） */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mx-auto w-24 h-24 rounded-full border-2 border-dashed border-black/20 flex items-center justify-center overflow-hidden hover:border-accent transition-colors"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="头像预览" className="w-full h-full object-cover" />
          ) : (
            <span className="text-black/40 text-xs text-center leading-tight">点击上传<br />头像 *</span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={pickAvatar}
          className="hidden"
        />

        <input
          className="border rounded-lg px-3 py-2 outline-none focus:ring-2 ring-accent"
          placeholder="用户名（至少2位）"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="border rounded-lg px-3 py-2 outline-none focus:ring-2 ring-accent"
          type="password"
          placeholder="密码（至少4位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {!avatar && <p className="text-xs text-center text-black/40">请上传头像</p>}
        <button
          disabled={loading || !avatar}
          className="bg-foreground text-white rounded-lg py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "注册中…" : "注册"}
        </button>
        <p className="text-sm text-center text-black/50">
          已有账号？<Link href="/login" className="text-blue-500 underline">登录</Link>
        </p>
      </form>
    </div>
  );
}
