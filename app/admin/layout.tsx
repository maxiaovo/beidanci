"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 管理后台子导航（移动端可横向滚动）
const NAV_ITEMS = [
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/parents", label: "家长" },
  { href: "/admin/site", label: "网站管理" },
  { href: "/admin/resources", label: "资源管理" },
  { href: "/admin/ai", label: "AI设置" },
  { href: "/admin/learning", label: "学习设置" },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="max-w-[1440px] mx-auto p-6 lg:px-10 flex flex-col gap-6">
      <nav className="flex gap-1 bg-black/5 rounded-full px-1 py-1 w-fit max-w-full overflow-x-auto text-sm">
        {NAV_ITEMS.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`rounded-full px-4 py-1 whitespace-nowrap transition-colors ${
              pathname === o.href ? "bg-foreground text-white" : "text-black/60 hover:text-black"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
