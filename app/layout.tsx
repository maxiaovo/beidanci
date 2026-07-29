import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import { getSiteTitle } from "@/lib/settings";
import { findSiteIcon } from "@/lib/site";
import { getSessionUser } from "@/lib/session";
import { getThemeVars, styleObjectFromVars, themeStateFromDb } from "@/lib/theme";

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

// viewportFit=cover：配合底部 Tab 栏的 env(safe-area-inset-bottom) 适配刘海屏
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const title = await getSiteTitle();
  return {
    title,
    description: "词根词缀记忆法背单词",
    icons: [{ url: findSiteIcon() ? "/api/site-icon" : "/favicon.ico" }],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  const themeState = themeStateFromDb(user?.themePreset, user?.themeCustom);
  const themeVars = getThemeVars(themeState);

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={styleObjectFromVars(themeVars)}
    >
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</main>
      </body>
    </html>
  );
}
