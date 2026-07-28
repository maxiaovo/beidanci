#!/usr/bin/env bash
# 部署 vocab-app 到 ledouniu.com 生产环境
# 前提：~/.ssh/config 已配置 ledouniu.com 主机别名；服务器上 .env 与生产数据库已就位
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER=ledouniu.com
REMOTE_DIR=ledouniu/vocab-app

echo "== 1/4 同步代码到服务器 =="
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git \
  --exclude .env --exclude data --exclude prisma/dev.db --exclude .DS_Store \
  ./ "$SERVER:$REMOTE_DIR/"

echo "== 2/4 服务器上安装依赖并构建 =="
ssh -o BatchMode=yes "$SERVER" \
  "cd ~/$REMOTE_DIR && npm ci && ./node_modules/.bin/prisma generate && npm run build"

echo "== 3/4 重启服务（start.sh.local 会自动执行 prisma migrate deploy）=="
ssh -o BatchMode=yes "$SERVER" "sudo -n systemctl restart ledouniu-mx.service"

echo "== 4/4 验证 =="
sleep 5
curl -sf -o /dev/null -w "https://ledouniu.com HTTP %{http_code}\n" --max-time 20 https://ledouniu.com
echo "部署完成 ✓"
