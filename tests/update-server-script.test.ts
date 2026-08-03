import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const script = fs.readFileSync(path.join(root, "scripts", "update-server.sh"), "utf8");
const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

test("automatic updates build in staging before touching the live application", () => {
  const build = script.indexOf("npm run build:update");
  const promote = script.indexOf('"$BUILD_DIR/" "$APP_DIR/"');

  assert.notEqual(build, -1, "the updater must run the memory-safe production build");
  assert.notEqual(promote, -1, "the updater must promote the staged release");
  assert.ok(build < promote, "the live application must not change before the build succeeds");
});

test("automatic updates are serialized and keep runtime data outside build tracing", () => {
  assert.match(script, /flock -n/);
  assert.match(script, /--exclude \.env/);
  assert.match(script, /--exclude data/);
  assert.match(script, /npm run typecheck/);
  assert.match(script, /UPDATE_SKIP_RESTART/);
  assert.match(nextConfig, /outputFileTracingExcludes/);
  assert.match(nextConfig, /\.\/data\/\*\*\/\*/);
});
