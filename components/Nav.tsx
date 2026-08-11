"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle,
  House,
  PencilLine,
  Student,
  UserCircle,
} from "@phosphor-icons/react";
import ActivityTicker from "@/components/ActivityTicker";

interface Me {
  username: string;
  role: string;
  parentCanLearn: boolean;
  avatarUrl: string | null;
}

interface SiteCfg {
  siteTitle: string;
  hasSiteIcon: boolean;
}

const TABS = [
  { href: "/", icon: House, label: "首页" },
  { href: "/writing", icon: PencilLine, label: "写作" },
  { href: "/learn", icon: BookOpen, label: "背单词" },
  { href: "/check", icon: CheckCircle, label: "检查" },
  { href: "/me", icon: UserCircle, label: "我的" },
];

// 普通家长（不可学习）只看孩子与自己的账号
const PARENT_ONLY_TABS = [
  { href: "/parent", icon: Student, label: "孩子" },
  { href: "/me", icon: UserCircle, label: "我的" },
];

// 学习型家长（parentCanLearn）：完整导航 + 「孩子」入口
const PARENT_LEARN_TABS = [
  { href: "/parent", icon: Student, label: "孩子" },
  ...TABS,
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
        ? "nav-link-active"
        : "text-foreground/70 hover:bg-black/5"
    }`;

  const isParent = me?.role === "parent";
  // 普通家长不可学习；学习型家长（parentCanLearn）导航与普通用户一致，外加「孩子」入口
  const canLearn = !!me && (!isParent || me.parentCanLearn);
  const mobileTabs = isParent ? (canLearn ? PARENT_LEARN_TABS : PARENT_ONLY_TABS) : TABS;

  return (
    <>
      <header className="border-b border-black/5 bg-white/60 backdrop-blur sticky top-0 z-40">
        {me && <ActivityTicker />}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
        <Link href="/" className="font-bold text-lg tracking-wide flex items-center gap-2 shrink-0">
          {site.hasSiteIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/site-icon" alt="" className="w-6 h-6 rounded object-contain" />
          ) : (
            <BookOpen size={24} weight="duotone" aria-hidden="true" />
          )}
          {site.siteTitle}
        </Link>

        {/* 桌面端导航（手机端用底部 Tab 栏） */}
        {me && (
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto whitespace-nowrap">
            {isParent && <Link href="/parent" className={linkCls("/parent")}>孩子</Link>}
            {canLearn && (
              <>
                <Link href="/" className={linkCls("/")}>首页</Link>
                <Link href="/writing" className={linkCls("/writing")}><span className="inline-flex items-center gap-1"><PencilLine size={15} />写作</span></Link>
                <Link href="/learn" className={linkCls("/learn")}>背单词</Link>
                <Link href="/check" className={linkCls("/check")}>检查</Link>
                <Link href="/import" className={linkCls("/import")}>导入</Link>
                {me.role === "admin" && <Link href="/admin" className={linkCls("/admin")}>管理</Link>}
              </>
            )}
            <Link href="/me" className={linkCls("/me")}>我的</Link>
          </nav>
        )}

        {/* 桌面端：头像 + 用户名 + 退出 */}
        <div className="hidden lg:flex items-center gap-3 text-sm shrink-0">
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
        <div className="shrink-0 lg:hidden">
          {me ? (
            <Link href="/me" aria-label="我的">
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
        </div>
      </header>

      {/* 手机端底部 Tab 栏 */}
      {me && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/90 backdrop-blur lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex">
            {mobileTabs.map((t) => {
              const Icon = t.icon;
              const active = isActive(t.href);
              const cls = `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${active ? "font-bold text-foreground" : "text-foreground/45"}`;
              return (
                <Link key={t.href} href={t.href} className={cls}>
                  <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden="true" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
