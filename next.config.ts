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
};

export default nextConfig;
