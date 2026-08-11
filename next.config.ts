import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // data/ contains user uploads and generated audio. These files are read at
  // runtime and must never be enumerated or bundled by Next's file tracer.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./prisma/dev.db*"],
  },
  // The updater runs an explicit `next typegen && tsc --noEmit` pass first,
  // then skips Next's duplicate type-check worker to stay within the VPS
  // service memory limit. Normal local/CI builds still type-check as usual.
  typescript: {
    ignoreBuildErrors: process.env.NEXT_SKIP_BUILD_TYPECHECK === "1",
  },
  // HTML 页面禁止启发式缓存：浏览器必须每次向服务器再验证，
  // 配合 /api/version 的版本检测，避免部署后仍展示旧缓存页面。
  // _next/static 等带内容哈希的静态资源不受影响（规则已排除）。
  async headers() {
    return [
      {
        source: "/((?!_next/|api/|.*\\..*).*)",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
