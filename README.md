# 背单词（vocab-app）

英语单词学习应用：导入词书（docx/xlsx/txt/csv）→ DeepSeek 自动分析音标/词根/例句 → TTS 生成读音 → 按 SRS 记忆曲线学习与检查。支持多用户、管理员分配词书。

导入支持**断点续传**：导入失败或被停止后，在单词书页 / 导入页点「继续导入」即可从断点恢复——已入库的单元跳过 AI 分析，已生成的音频不重复合成，只补缺失部分。管理页「音频资源」可单条 ↻ 重新生成，也可一键「补齐全部缺失音频」。

## TTS 语音合成（千问 Qwen3-TTS）

TTS 统一走**千问（DashScope）原生接口**（`POST {baseUrl}` → 响应 `output.audio.url` → 二次下载 WAV），默认模型 `qwen3-tts-flash`，英语音色池 Jennifer / Ryan / Katerina / Aiden 随机选用。在「管理 → 设置 → TTS 语音设置」中配置 Base URL / Token / 模型 / 音色 / 朗读指令，可在线检测连接与试听；也可用环境变量 `TTS_BASE_URL`、`TTS_API_TOKEN`、`TTS_MODEL`、`TTS_VOICE`、`TTS_INSTRUCTION` 配置（Setting 表优先于环境变量）。重新生成的音频按版本保留，可在「管理 → 音频资源」中切换 / 删除历史版本。

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

环境变量（`.env`）：`DATABASE_URL`、`SESSION_SECRET`、`DEEPSEEK_API_KEY`、`TTS_API_TOKEN`（TTS 服务未启用鉴权可留空）等，参考服务器上的配置。

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
