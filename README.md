# 背单词（vocab-app）

英语单词学习应用：导入词书（docx/xlsx/txt/csv）→ DeepSeek 自动分析音标/词根/例句 → MiMo TTS 生成读音 → 按 SRS 记忆曲线学习与检查。支持多用户、管理员分配词书。

## 本地开发

```bash
npm install
npx prisma migrate deploy
npm run dev        # http://localhost:3003
```

首次使用创建管理员账号：

```bash
npx tsx scripts/seed.ts          # 默认 admin / admin123
```

环境变量（`.env`）：`DATABASE_URL`、`SESSION_SECRET`、`DEEPSEEK_API_KEY`、`MIMO_API_KEY` 等，参考服务器上的配置。

## 部署（生产：https://ledouniu.com）

服务器通过 `~/.ssh/config` 的 `ledouniu.com` 别名访问，应用位于 `~/ledouniu/vocab-app`，由 systemd 服务 `ledouniu-mx.service` 运行（`start.sh.local` → `prisma migrate deploy` + `next start` 监听 127.0.0.1:3003，nginx 反向代理 HTTPS）。

**发布流程约定：每个版本先 git 提交并推送，再部署。**

```bash
git add -A && git commit -m "..." && git push   # 1. 提交版本
npm run deploy                                   # 2. 一键部署（scripts/deploy.sh）
```

`scripts/deploy.sh` 做的事：rsync 同步代码（排除 `.env`、`data/`、`prisma/dev.db` 等服务器侧数据）→ 服务器上 `npm ci && prisma generate && next build` → `sudo systemctl restart ledouniu-mx.service` → 验证 https://ledouniu.com 可访问。

注意：服务器上的 `.env`、`prisma/dev.db`（生产数据库）、`data/audio/`（生成的音频）是生产数据，部署不会覆盖，也不要手动删除。

## 系统自动更新

管理员在「设置 → 系统更新」中可直接检查 GitHub 仓库（[maxiaovo/beidanci](https://github.com/maxiaovo/beidanci)）main 分支的版本：发现新版本时点击「立即更新」，服务器会自动下载最新代码、`npm ci && next build` 并重启服务（`scripts/update-server.sh`，进度与日志见服务器 `data/update-status.json` / `data/update.log`）。版本号以 `package.json` 的 `version` 为准，发布新版本时记得递增。
