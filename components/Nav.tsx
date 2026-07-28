"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  username: string;
  role: string;
  avatarUrl: string | null;
}

export default function Nav() {
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, [pathname]);

  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isAuthPage) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/login");
  }

  const linkCls = (href: string) =>
    `px-3 py-1.5 rounded-full text-sm transition-colors ${
      (href === "/" ? pathname === "/" : pathname.startsWith(href))
        ? "bg-[#2d2a32] text-white"
        : "text-[#2d2a32]/70 hover:bg-black/5"
    }`;

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-black/5 bg-white/60 backdrop-blur sticky top-0 z-40">
      <Link href="/" className="font-bold text-lg tracking-wide">
        📖 背单词
      </Link>
      {me && (
        <nav className="flex items-center gap-1">
          <Link href="/" className={linkCls("/")}>首页</Link>
          <Link href="/words" className={linkCls("/words")}>单词书</Link>
          <Link href="/learn" className={linkCls("/learn")}>背单词</Link>
          <Link href="/check" className={linkCls("/check")}>检查</Link>
          <Link href="/import" className={linkCls("/import")}>导入</Link>
          {me.role === "admin" && <Link href="/admin" className={linkCls("/admin")}>管理</Link>}
          <Link href="/settings" className={linkCls("/settings")}>设置</Link>
        </nav>
      )}
      <div className="flex items-center gap-3 text-sm">
        {me ? (
          <>
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/avatars/${me.avatarUrl}`}
                alt={me.username}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <span className="w-7 h-7 rounded-full bg-[#A8D8EA] flex items-center justify-center text-xs font-bold">
                {me.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-[#2d2a32]/60">{me.username}</span>
            <button onClick={logout} className="text-[#2d2a32]/50 hover:text-[#2d2a32]">
              退出
            </button>
          </>
        ) : (
          <Link href="/login" className="text-[#2d2a32]/70">登录</Link>
        )}
      </div>
    </header>
  );
}
