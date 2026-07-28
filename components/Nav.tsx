"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  username: string;
  role: string;
  avatarUrl: string | null;
}

interface SiteCfg {
  siteTitle: string;
  hasSiteIcon: boolean;
}

export default function Nav() {
  const [me, setMe] = useState<Me | null>(null);
  const [site, setSite] = useState<SiteCfg>({ siteTitle: "背单词", hasSiteIcon: false });
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setSite({ siteTitle: d.siteTitle || "背单词", hasSiteIcon: !!d.hasSiteIcon }))
      .catch(() => {});
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
        ? "bg-foreground text-white"
        : "text-foreground/70 hover:bg-black/5"
    }`;

  return (
    <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-black/5 bg-white/60 backdrop-blur sticky top-0 z-40">
      <Link href="/" className="font-bold text-lg tracking-wide flex items-center gap-2 shrink-0">
        {site.hasSiteIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/site-icon" alt="" className="w-6 h-6 rounded object-contain" />
        ) : (
          <span>📖</span>
        )}
        {site.siteTitle}
      </Link>
      {me && (
        <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
          <Link href="/" className={linkCls("/")}>首页</Link>
          <Link href="/words" className={linkCls("/words")}>单词书</Link>
          <Link href="/learn" className={linkCls("/learn")}>背单词</Link>
          <Link href="/check" className={linkCls("/check")}>检查</Link>
          <Link href="/import" className={linkCls("/import")}>导入</Link>
          {me.role === "admin" && <Link href="/admin" className={linkCls("/admin")}>管理</Link>}
          <Link href="/settings" className={linkCls("/settings")}>设置</Link>
        </nav>
      )}
      <div className="flex items-center gap-3 text-sm shrink-0">
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
              <span className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-bold">
                {me.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-foreground/60 hidden sm:inline">{me.username}</span>
            <button onClick={logout} className="text-foreground/50 hover:text-foreground">
              退出
            </button>
          </>
        ) : (
          <Link href="/login" className="text-foreground/70">登录</Link>
        )}
      </div>
    </header>
  );
}
