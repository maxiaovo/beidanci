#!/usr/bin/env bash
# 服务器端自动更新：从 GitHub 拉取最新 main 分支代码、构建并重启服务
# 由 /api/update 接口复制到 data/.update-run.sh 后脱离进程执行（避免 rsync 覆盖自身）
set -uo pipefail
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
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

write_status downloading "正在下载最新版本…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -sfL --max-time 600 \
  https://github.com/maxiaovo/beidanci/archive/refs/heads/main.tar.gz \
  -o "$TMP/app.tar.gz" || fail "下载失败，请检查服务器网络"
tar -xzf "$TMP/app.tar.gz" -C "$TMP" || fail "解压失败"

# 同步代码（保留服务器侧数据：.env / data / 生产数据库 / node_modules / .next）
rsync -a --delete \
  --exclude .env --exclude data --exclude prisma/dev.db \
  --exclude node_modules --exclude .next --exclude .git --exclude .DS_Store \
  "$TMP/beidanci-main/" "$APP_DIR/" || fail "同步代码失败"

write_status building "正在安装依赖并构建（可能需要几分钟）…"
# 服务进程带 NODE_ENV=production，npm ci 默认会跳过 devDependencies（tailwind/typescript 等构建必需），必须显式包含
npm ci --include=dev || fail "npm ci 失败"
./node_modules/.bin/prisma generate || fail "prisma generate 失败"
npm run build || fail "构建失败"

write_status restarting "正在重启服务…"
sleep 2
# 服务单元设有 NoNewPrivileges=true，进程内无法 sudo；改为 SIGKILL 主进程，
# systemd（Restart=on-failure，SIGKILL 属异常退出）会自动用新代码重启整个服务
MAINPID=$(systemctl show -p MainPID --value ledouniu-mx.service)
[ -n "$MAINPID" ] && [ "$MAINPID" != "0" ] || fail "无法获取服务主进程 PID"
kill -9 "$MAINPID" || fail "重启服务失败"
