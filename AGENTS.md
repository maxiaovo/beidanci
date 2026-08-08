<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:codebase-index-rules -->
# Codebase Index First (codebase-memory-mcp)

本项目已通过 codebase-memory-mcp 建立知识图谱索引（project: `Users-maxiao-Documents-vibecoding-English-vocab-app`）。为节省 token，读代码时**先查索引，再按需读源码**：

1. `search_graph` — 找函数 / 类 / 路由 / 变量的定义位置
2. `trace_path` — 查调用方 / 被调用方，做影响分析
3. `get_code_snippet` — 只读目标函数/类的源码，而不是整个文件
4. `query_graph` — 复杂模式（多跳、聚合）用 Cypher
5. `get_architecture` — 先看整体结构再深入

只有以下情况才直接用 Grep/Glob/Read 全文件：
- 搜字符串字面量、错误信息、配置值
- 非代码文件（shell 脚本、配置、prisma schema 等）
- MCP 结果不足时的兜底

## 索引维护（每次编码任务结束后由 agent 自行判断）

- 持久化产物 `.codebase-memory/graph.db.zst` 已提交进 main，重建索引后如需同步可一并提交
- 每次任务结束后，agent 根据本次改动自行判断是否需要重建索引（`index_repository`，mode 用 `moderate`，更快）。**满足以下任一条件即重建**：
  - 新增或删除了源文件（新的页面、路由、lib 模块、组件等）
  - 文件被移动或重命名，目录结构变化
  - 函数 / 类 / API 路由被删除、重命名，或签名（参数、返回值）发生变化
  - prisma schema 变更
- 以下情况**不必重建**：只改函数内部实现、样式、文案、测试、配置值
- 重建后 `.codebase-memory/graph.db.zst` 会变化，提交代码时一并提交该文件
- 不确定索引是否过时，先用 `index_status` 查状态
<!-- END:codebase-index-rules -->

<!-- BEGIN:nas-deploy -->
# 部署到 NAS（局域网测试站）

本项目可通过统一脚本发布到群晖 NAS 的常驻 Docker 测试容器，便于在真机/局域网验证。**这是「局域网测试站」，不是生产站**（生产站 ledouniu.com 由 VPS 直接运营，见 `scripts/deploy.sh`，与此无关）。

## 命令（在 Mac 上跑）
```bash
# 常规部署：同步代码 → 容器内 build → 启动
bash /Users/maxiao/Documents/聊天室/畅聊吧2/deploy-nas.sh vocab-app

# 改了 package.json / 依赖时，强制重装 node_modules
bash /Users/maxiao/Documents/聊天室/畅聊吧2/deploy-nas.sh vocab-app --deps

# 跟踪运行日志
bash /Users/maxiao/Documents/聊天室/畅聊吧2/deploy-nas.sh vocab-app --logs
```

## 脚本在 NAS 上做了什么
- **传输层 = tar-over-ssh**：`tar czf - | ssh ... cat`。⚠️ DSM(群晖) 封了 `rsync --server` 模式、也没有 sftp 子系统，所以**必须用 tar 而非 rsync/scp**——脚本已封装好，勿改回 rsync。
- **容器** `vocab-app-dev`（镜像 `node:22`）：bind 挂载 `/volume1/dev/vocab-app/app` → 容器 `/app`，node_modules 在独立卷 `vocab-app_nm`。
- **启动方式（Next.js 生产式）**：先 `npm run build:client`（`prisma generate && next build`），再 `npm start`（`prisma migrate deploy && next start -p 3003`）。
- **端口**：容器内固定 3003，映射到 NAS `3003`。**注意：NAS 的 3003 现在只是局域网端口**——ledouniu.com 已改为 VPS 直营、不再反代理解 NAS。所以测试访问地址是 `http://192.168.1.2:3003`（仅局域网）。
- **自动重启**：`--restart unless-stopped`，NAS/Docker 重启后通常自动拉起；若没起来，`sudo /usr/local/bin/docker start vocab-app-dev`。

## 验证
```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://192.168.1.2:3003/
# 或浏览器直接开 http://192.168.1.2:3003/
```

## 重要约定 / 坑
- **NAS 上 docker 必须全路径**：`sudo /usr/local/bin/docker`（NOPASSWD 只匹配全路径；`sudo docker` 会要密码）。脚本已处理。
- **SQLite 数据持久化**：本项目的库是 `prisma/dev.db`（SQLite，**不是**那个共享 MySQL）。部署脚本已特意 **排除 `dev.db*` 不同步、且解包时 `prune prisma`**，故用户在测试站产生的学习记录/导入不会被部署覆盖。**NAS 上的 `prisma/dev.db` 才是运行数据源**；Mac 本地 `prisma/dev.db` 不会被推上去。改表结构请走 `prisma migrate`（迁移文件会同步进容器并 `migrate deploy` 应用），不要手动改 NAS 的 dev.db。
- **不要在部署容器里用 `next dev`**：dev 模式在 NAS 弱 CPU 上构建/响应都很慢，旧版经隧道还卡死；一律 build + start。
- **凭证勿提交**：`.env` 含 DEEPSEEK / TTS（千问 Qwen3-TTS）密钥与 `SESSION_SECRET`，以及 `DATABASE_URL=file:./dev.db`。
- **两条部署链路别混**：`scripts/deploy.sh` = 生产（rsync + systemctl 到 VPS/ledouniu.com）；`deploy-nas.sh vocab-app` = 局域网测试（tar-over-ssh 到 NAS）。两者目标、机制、网络完全不同。
<!-- END:nas-deploy -->
