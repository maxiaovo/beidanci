import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSiteTitle } from "@/lib/settings";
import { findSiteIcon } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 站点标题/图标可被管理员修改，需实时读取
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const title = await getSiteTitle();
  return {
    title,
    description: "词根词缀记忆法背单词",
    icons: [{ url: findSiteIcon() ? "/api/site-icon" : "/favicon.ico" }],
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
