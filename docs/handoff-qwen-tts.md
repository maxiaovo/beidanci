# 交接文档：vocab-app 千问 TTS 改造（接力开发用）

> 面向 workbuddy / codex 等编码代理。包含私有凭据，仅限项目所有者本人使用，勿外传、勿提交公开仓库。

## 一句话现状

背单词 Next.js 应用。需求已澄清、计划已写好但**尚未实施任何代码改动**。实施计划全文在仓库 `docs/qwen-tts-plan.md`，本文件只补充上下文与约定，不重复计划内容。

## 要做的事

按 `docs/qwen-tts-plan.md` 的步骤 0→6 实施：

1. TTS 切换到千问（dashscope 兼容模式），模型 `qwen-audio-3.0-tts-flash`
2. 英语音色 Jennifer / Ryan / Katerina / Aiden 随机使用，并在管理员后台列出（带试听）
3. 合成带"英语教学示范朗读"指令
4. 导入图书增加音频生成审批流（分析完先停在 `pending_audio`，管理员试生成几个词、批准后批量继续）
5. 单词级重新生成增强：支持临时指令 + 替代拼写纠音

## 项目基本信息

- 路径：`/Users/maxiao/Documents/vibecoding/English/vocab-app`
- 技术栈：Next.js **16.2.12**（App Router）+ React + TypeScript + Prisma（SQLite `prisma/dev.db`）+ Tailwind
- 包管理：npm（有 `package-lock.json`）
- 常用命令：`npx tsc --noEmit`、`npm run lint`、`npx prisma migrate dev`、`npm run dev`
- 数据库：`DATABASE_URL` 在 `.env`，指向 `prisma/dev.db`

## 关键凭据（私有）

写入 `.env`（确认 `.gitignore` 已忽略 `.env`，**不要写进代码或提交**）：

```
TTS_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
TTS_API_TOKEN=sk-ws-H.EIXXRRD.1Vjc.MEUCIQCcMt9XyYq7goQNGuZBuJhZvqqR_XA1q_rP9eSbpISXkQIgZAGLJIigN8hcNTn2pMd1gXhUkFsZliI4EwdKNRH-nzg
TTS_MODEL=qwen-audio-3.0-tts-flash
```

AI 解析（DeepSeek）已有配置，经 `lib/settings.ts` 的 `getAIConfig()` 读取，勿动。

## 必须遵守的项目约定（来自 AGENTS.md）

1. **"This is NOT the Next.js you know"**：Next 16.2.12 有破坏性变更，写路由/页面前先查 `node_modules/next/dist/docs/` 相关文档，留意弃用提示。现有路由写法（`export async function GET/POST(req: Request)` + `NextResponse`）可作为对齐基准。
2. **codebase-memory-mcp 知识图谱优先**（project: `Users-maxiao-Documents-vibecoding-English-vocab-app`）：
   - 找代码：`search_graph` → `trace_path`（调用方/影响分析）→ `get_code_snippet`（只读目标函数源码）→ `query_graph`（复杂 Cypher）→ `get_architecture`
   - 只有搜字符串字面量、错误信息、非代码文件，或 MCP 结果不足时才用 Grep/Glob/Read 兜底
3. **索引维护**：本次改动涉及 schema 变更 + 新路由 + 函数签名变化，完成后必须用 `index_repository`（mode: `moderate`）重建索引，`.codebase-memory/graph.db.zst` 随代码一并提交。仅改实现/样式/文案则不必重建。
4. git 提交前先征得用户同意。

## 代码地图（已摸底，省去重复探索）

- TTS 抽象三层：
  - `lib/settings.ts` `getTTSConfig()`（TTSConfig: baseUrl/apiKey/model/voice，Setting 表 > env > 默认；AI 配置 `getAIConfig()` 同模式）
  - `lib/openai-tts.ts` `synthesizeSpeech(cfg, text)` → POST `{baseUrl}/audio/speech`，WAV Buffer，3 次重试
  - `lib/tts.ts` `synthesize(text, fileName, opts)` → 写 `data/audio/`，`opts.out.voice` 回传音色；`AUDIO_DIR = data/audio`
- 导入流水线 `lib/import-runner.ts`：进程内串行队列（重启丢队列）；`runImport` 两阶段（DeepSeek 分析入库 → 批量音频）；断点续传靠 `Book.rawUnits` + 文件存在性检查；`resumeImport` / `requestStop` / `getImportStatus`（内存环形日志 200 条）
- 管理后台单文件 `app/admin/page.tsx`（约 1800 行，client component）：
  - TTS 设置 UI 在约 1610–1721 行；音频资源列表在约 1724–1820 行；词书列表/状态显示在约 1169–1275 行；导入实况约 1277 行起
- 相关 API 路由：
  - `GET/PATCH /api/admin/config`（站点+AI+TTS 设置，`strFields` 映射 Setting 表 key）
  - `POST /api/admin/tts-preview`（试听，body 可带未保存配置，回传 WAV）
  - `POST /api/admin/tts-status`（GET `{baseUrl}/models` 探测连通性）
  - `GET/POST /api/admin/audio`（音频列表 / 单词级重新生成，kind: word|ex1|ex2|all）
  - `POST /api/admin/audio/backfill`（一键补齐缺失音频 → 逐本 `resumeImport`）
  - `GET /api/admin/import-status`（队列状态 + 最近事件）
- Prisma：`Book.status` 现值 `queued|processing|ready|error|stopped`；`Word.audioWord/audioEx1/audioEx2` 存文件名
- 音频静态服务：`app/api/audio/[name]`；前端播放组件 `components/AudioButton.tsx`

## 已知风险（实施时注意）

- 用户给的模型名、音色名、文档域名（platform.qianwenai.com）与公开 dashscope 文档可能不一致 → **第一步必须 curl 实测**，不一致如实向用户反馈并按实测调整；instruction 参数名以实测为准，不支持就降级不传并说明。
- 进程内队列重启即丢，`pending_audio` 的书重启后需管理员手动批准触发，属预期行为。
- `data/audio/` 与 `data/audio-qwen/` 两个目录并存，当前生效的是 `data/audio`（`AUDIO_DIR` 常量），不要混淆。

## 验收标准（完成后必须自验）

- `npx tsc --noEmit`、`npm run lint` 通过
- curl 实测 4 音色 + instruction 各合成成功
- 完整走通：导入小书 → 停在"待批准音频" → 试生成 2 词（1 个用替代拼写）试听 → 批准 → 批量完成、状态 ready、日志可见随机音色

## 建议下一个会话使用的技能

- `diagnose`：若 curl 实测与文档不符、或合成失败需要排查时
- `tdd`：如要为审批流/合成层补测试（项目目前无测试基建，非必需，先问用户）
