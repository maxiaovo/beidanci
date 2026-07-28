"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regOpen, setRegOpen] = useState(true);
  const [siteTitle, setSiteTitle] = useState("背单词");
  const [hasIcon, setHasIcon] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => {
        setRegOpen(d.registrationOpen !== false);
        setSiteTitle(d.siteTitle || "背单词");
        setHasIcon(!!d.hasSiteIcon);
      })
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError(data.error || "登录失败");
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-8 w-80 flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-center flex items-center justify-center gap-2">
          {hasIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/site-icon" alt="" className="w-7 h-7 rounded object-contain" />
          ) : (
            <span>📖</span>
          )}
          {siteTitle}
        </h1>
        <input
          className="border rounded-lg px-3 py-2 outline-none focus:ring-2 ring-accent"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          className="border rounded-lg px-3 py-2 outline-none focus:ring-2 ring-accent"
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          disabled={loading}
          className="bg-foreground text-white rounded-lg py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "登录中…" : "登录"}
        </button>
        {regOpen && (
          <p className="text-sm text-center text-black/50">
            没有账号？<Link href="/register" className="text-blue-500 underline">注册</Link>
          </p>
        )}
      </form>
    </div>
  );
}
