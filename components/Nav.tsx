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

const TABS = [
  { href: "/", icon: "🏠", label: "首页" },
  { href: "/words", icon: "📚", label: "单词书" },
  { href: "/learn", icon: "✏️", label: "背单词" },
  { href: "/check", icon: "✅", label: "检查" },
  { href: "/settings", icon: "👤", label: "我的" },
];

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkCls = (href: string) =>
    `px-3 py-1.5 rounded-full text-sm transition-colors ${
      isActive(href)
        ? "bg-foreground text-white"
        : "text-foreground/70 hover:bg-black/5"
    }`;

  return (
    <>
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

        {/* 桌面端导航（手机端用底部 Tab 栏） */}
        {me && (
          <nav className="hidden sm:flex items-center gap-1 overflow-x-auto whitespace-nowrap">
            <Link href="/" className={linkCls("/")}>首页</Link>
            <Link href="/words" className={linkCls("/words")}>单词书</Link>
            <Link href="/learn" className={linkCls("/learn")}>背单词</Link>
            <Link href="/check" className={linkCls("/check")}>检查</Link>
            <Link href="/import" className={linkCls("/import")}>导入</Link>
            {me.role === "admin" && <Link href="/admin" className={linkCls("/admin")}>管理</Link>}
            <Link href="/settings" className={linkCls("/settings")}>设置</Link>
          </nav>
        )}

        {/* 桌面端：头像 + 用户名 + 退出 */}
        <div className="hidden sm:flex items-center gap-3 text-sm shrink-0">
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
              <span className="text-foreground/60">{me.username}</span>
              <button onClick={logout} className="text-foreground/50 hover:text-foreground">
                退出
              </button>
            </>
          ) : (
            <Link href="/login" className="text-foreground/70">登录</Link>
          )}
        </div>

        {/* 手机端：右侧头像（未登录显示登录入口） */}
        <div className="sm:hidden shrink-0">
          {me ? (
            <Link href="/settings" aria-label="我的">
              {me.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/avatars/${me.avatarUrl}`}
                  alt={me.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold">
                  {me.username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </Link>
          ) : (
            <Link href="/login" className="text-sm text-foreground/70">登录</Link>
          )}
        </div>
      </header>

      {/* 手机端底部 Tab 栏 */}
      {me && (
        <nav
          className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur border-t border-black/5"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                  isActive(t.href) ? "text-foreground font-bold" : "text-foreground/45"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
