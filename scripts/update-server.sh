#!/usr/bin/env bash
# 服务器端自动更新：从 GitHub 拉取最新 main，在隔离目录中验证、构建，成功后再发布并重启。
# 由 /api/update 接口复制到 data/.update-run.sh 后执行，避免发布时覆盖正在运行的脚本自身。
set -uo pipefail
SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${UPDATE_APP_DIR:-$SCRIPT_ROOT}"
DATA_DIR="$APP_DIR/data"
STATUS_FILE="$DATA_DIR/update-status.json"
LOG_FILE="$DATA_DIR/update.log"
mkdir -p "$DATA_DIR"

write_status() { # state message
  printf '{"state":"%s","message":"%s","target":"%s","updatedAt":%d}\n' \
    "$1" "$2" "${TARGET_VERSION:-}" "$(date +%s)" > "$STATUS_FILE.tmp" && mv "$STATUS_FILE.tmp" "$STATUS_FILE"
}
fail() { write_status failed "$1"; echo "FAILED: $1"; exit 1; }

exec >>"$LOG_FILE" 2>&1
echo "===== update to ${TARGET_VERSION:-unknown} started $(date -Is) ====="

# API 层会拦截重复请求；文件锁再保护一次，避免超时后重复点击或多个进程同时发布。
exec 9>"$DATA_DIR/update.lock"
if ! flock -n 9; then
  echo "SKIPPED: another update is already running"
  exit 0
fi

write_status downloading "正在下载最新版本…"
TMP="$(mktemp -d "$DATA_DIR/update-work.XXXXXX")" || fail "无法创建更新临时目录"
trap 'rm -rf "$TMP"' EXIT
curl -sfL --max-time 600 \
  "${UPDATE_ARCHIVE_URL:-https://github.com/maxiaovo/beidanci/archive/refs/heads/main.tar.gz}" \
  -o "$TMP/app.tar.gz" || fail "下载失败，请检查服务器网络"
BUILD_DIR="$TMP/source"
mkdir -p "$BUILD_DIR" || fail "无法创建构建目录"
tar -xzf "$TMP/app.tar.gz" --strip-components=1 -C "$BUILD_DIR" || fail "解压失败"

ARCHIVE_VERSION="$(cd "$BUILD_DIR" && node -p "require('./package.json').version" 2>/dev/null)" || fail "无法读取下载版本"
if [ -n "${TARGET_VERSION:-}" ] && [ "$ARCHIVE_VERSION" != "$TARGET_VERSION" ]; then
  fail "下载版本与目标版本不一致，请稍后重试"
fi

# 构建需要生产环境变量，但不复制密钥；临时目录只创建指向生产 .env 的符号链接。
if [ -f "$APP_DIR/.env" ]; then
  ln -s "$APP_DIR/.env" "$BUILD_DIR/.env" || fail "无法准备构建环境"
fi

write_status building "正在隔离环境中安装依赖、检查类型并构建…"
cd "$BUILD_DIR" || fail "无法进入构建目录"
# 服务进程带 NODE_ENV=production，必须显式安装 Tailwind/TypeScript 等构建依赖。
npm ci --include=dev || fail "npm ci 失败"
./node_modules/.bin/prisma generate || fail "prisma generate 失败"

# Next 的内置类型检查会额外启动一个接近 400MB 的 worker；在 768MB 服务 cgroup 中会与
# 正在提供访问的站点进程争抢内存。先以单进程完成完整类型检查，再让构建跳过重复检查。
TYPECHECK_HEAP_MB="${UPDATE_TYPECHECK_HEAP_MB:-448}"
BUILD_HEAP_MB="${UPDATE_BUILD_HEAP_MB:-384}"
NODE_OPTIONS="--max-old-space-size=$TYPECHECK_HEAP_MB" npm run typecheck || fail "类型检查失败"
NODE_OPTIONS="--max-old-space-size=$BUILD_HEAP_MB" npm run build:update || fail "构建失败"

# 只有下载、依赖、类型检查和生产构建全部成功后才接触线上目录；失败时旧站点保持完整可用。
write_status building "构建成功，正在发布新版本…"
rsync -a --delete --delay-updates --delete-delay \
  --exclude .env --exclude data --exclude 'prisma/dev.db*' \
  --exclude .git --exclude .DS_Store \
  "$BUILD_DIR/" "$APP_DIR/" || fail "发布文件失败"

# 重启服务会终止同一 cgroup 内的更新进程，因此必须在重启前主动清理构建目录。
rm -rf "$TMP"
trap - EXIT

if [ "${UPDATE_SKIP_RESTART:-0}" = "1" ]; then
  write_status done "已完成更新演练"
  echo "DRY RUN COMPLETE: v$ARCHIVE_VERSION"
  exit 0
fi

write_status restarting "正在重启服务…"
sleep 2
# 服务单元设有 NoNewPrivileges=true，进程内无法 sudo；改为 SIGKILL 主进程，
# systemd（Restart=on-failure，SIGKILL 属异常退出）会自动用新代码重启整个服务
MAINPID=$(systemctl show -p MainPID --value ledouniu-mx.service)
[ -n "$MAINPID" ] && [ "$MAINPID" != "0" ] || fail "无法获取服务主进程 PID"
kill -9 "$MAINPID" || fail "重启服务失败"
