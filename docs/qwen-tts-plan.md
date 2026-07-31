# 千问 TTS 接入 + 导入音频审批流 + 单词音频重新生成增强

> 实施计划文档，供编码工具按步骤执行。

> ⚠️ **实测结论（2026-07-31 已在分支 `feat/qwen-tts-approval` 实施完成）**：原计划假设的「OpenAI 兼容 `/audio/speech`」**不成立**。实测发现：
> 1. 千问 TTS 是 **DashScope 原生接口**：`POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`，请求体 `{model, input:{text, voice, language_type}, instructions?}`，响应 JSON 里 `output.audio.url` 是 24h 有效的音频地址，**需再下载**得到 WAV（不是直接返回二进制）。
> 2. 模型名 `qwen-audio-3.0-tts-flash` 在账户中**不存在**；真实可用 `qwen3-tts-flash`（4 个音色 Jennifer / Ryan / Katerina / Aiden 全部可用）。
> 3. `instruction` 仅 `qwen3-tts-instruct-flash` 系列支持；而该模型**不支持**上述 4 个音色。折中：`qwen3-tts-flash` 接受 instruction 字段但不报错（实际被忽略），故默认模型用 `qwen3-tts-flash` + 随机 4 音色，instruction 作为「尽力而为」透传。
> 实现已落地：合成层改写见 `lib/openai-tts.ts`；`lib/settings.ts` 默认 Base URL / 模型 / instruction 已更新；审批流（`Book.audioApproved` + `pending_audio` + `approveBookAudio` + `/api/admin/audio/approve`）已就绪；后台 UI 已加音色试听列表、指令输入、重新生成面板（临时指令 + 替代拼写）、待批准区块。`tsc` 通过；功能已端到端实测（4 音色合成 + 审批流 pending_audio→ready 真实生成音频）。

## 需求

1. TTS 使用"千问AI平台"在线服务（OpenAI 兼容模式）：
   - Base URL：`https://dashscope.aliyuncs.com/compatible-mode/v1`
   - Api Key：`sk-ws-H.EIXXRRD.1Vjc.MEUCIQCcMt9XyYq7goQNGuZBuJhZvqqR_XA1q_rP9eSbpISXkQIgZAGLJIigN8hcNTn2pMd1gXhUkFsZliI4EwdKNRH-nzg`（写入 `.env`，不要提交进代码）
   - 模型：`qwen-audio-3.0-tts-flash`
   - 模型文档：https://platform.qianwenai.com/docs/developer-guides/speech/tts
   - 音色列表：https://platform.qianwenai.com/docs/api-reference/speech-synthesis/qwen-tts/voice-list
2. 合成英语时，从 **Jennifer / Ryan / Katerina / Aiden** 四个音色中随机使用；这四个音色要在网站（管理员后台）上列出来。
3. 合成英语时携带指令：正在进行英语教学示范朗读。
4. 导入图书时不要一股脑全生成完：先不生成音频，管理员在后台试着生成几个词验证效果，批准可以继续生成后，再进行批量生成。
5. 仍旧支持选中单词的重新生成（有的单词会读错）：重新生成时可以使用新的指令，或手工输入"替代拼写"让生成的读音正确（只影响合成读音，不改单词文本）。

## 背景（现有代码结构）

- TTS 已抽象为 OpenAI 兼容接口：
  - `lib/openai-tts.ts` — `synthesizeSpeech(cfg, text)`，POST `{baseUrl}/audio/speech`，返回 WAV Buffer，带重试。
  - `lib/tts.ts` — `synthesize(text, fileName, opts)`，写入 `data/audio/`，`opts.out.voice` 回传实际音色。
  - `lib/settings.ts` — `getTTSConfig()`：Setting 表 > 环境变量（`TTS_BASE_URL` / `TTS_API_TOKEN` / `TTS_MODEL` / `TTS_VOICE`）> 默认值。
- 导入流水线 `lib/import-runner.ts`：`runImport` 两阶段——1) AI 分析入库；2) 批量生成全部音频（含断点续传：已有记录且文件存在的跳过）。全局串行队列，`resumeImport` 支持断点续传。
- 管理员后台 `app/admin/page.tsx`（单文件约 1800 行）：
  - 设置 tab：TTS 设置表单（baseUrl/apiKey/model/voice + 试听按钮），保存走 `PATCH /api/admin/config`，试听走 `POST /api/admin/tts-preview`，连通性探测走 `POST /api/admin/tts-status`。
  - 管理 tab："音频资源"列表（▶ 试听、↻ 重新生成），数据 `GET /api/admin/audio`，重新生成 `POST /api/admin/audio`（body: `{wordId, kind: word|ex1|ex2|all}`）。
- `prisma/schema.prisma`：Book.status 现有值 `queued | processing | ready | error | stopped`；Word 有 `audioWord / audioEx1 / audioEx2` 字段（文件名，位于 `data/audio/`）。
- Next.js 版本为 16.2.12，**注意项目 AGENTS.md 提示**：此版本有破坏性变更，写代码前先查 `node_modules/next/dist/docs/` 里的相关文档。

## 实施步骤

### 0. 先实测 API 格式（动手前第一步）

用 `curl` 实测千问接口，确认请求格式（用户给的模型名/音色名/文档域名与公开 dashscope 文档可能不一致，以实测为准）：

```bash
curl -X POST https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech \
  -H "Authorization: Bearer $TTS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen-audio-3.0-tts-flash","voice":"Jennifer","input":"adventure","response_format":"wav"}' \
  --output /tmp/test.wav
```

- 4 个音色各试一次，确认都可用。
- 确认"指令"的正确传法：先试 body 加 `instructions` 字段（如 `"instructions":"用英语教学示范朗读的语气，发音清晰、语速适中地朗读"`）；若报错或被忽略，查阅官方文档调整（可能还需要 `language_type: "English"` 等参数）。**以实测结果为准**，再定代码改动。若该模型不支持指令参数，则降级为不传并向用户说明。
- 用户给的文档链接若打不开，以 dashscope 官方文档 + 实测为准。

### 1. 配置默认值与 .env

- `.env` 写入：
  ```
  TTS_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
  TTS_API_TOKEN=sk-ws-H.EIXXRRD.1Vjc.MEUCIQCcMt9XyYq7goQNGuZBuJhZvqqR_XA1q_rP9eSbpISXkQIgZAGLJIigN8hcNTn2pMd1gXhUkFsZliI4EwdKNRH-nzg
  TTS_MODEL=qwen-audio-3.0-tts-flash
  ```
  （确认 `.gitignore` 已含 `.env`。）
- `lib/settings.ts`：
  - `DEFAULT_TTS_BASE_URL` / `DEFAULT_TTS_MODEL` 改为千问值。
  - 新增并导出常量 `EN_TTS_VOICES = ["Jennifer", "Ryan", "Katerina", "Aiden"]`（后台展示与随机选用共用）。
  - `TTSConfig` 增加 `instruction: string`；新增 `DEFAULT_TTS_INSTRUCTION = "用英语教学示范朗读的语气，发音清晰、语速适中地朗读"`；读取 `tts_instruction` Setting 项（管理员可覆盖）。
  - `voice` 字段保留作为兜底。

### 2. 合成层改动

- `lib/openai-tts.ts`：`synthesizeSpeech(cfg, text, opts?: { voice?: string; instruction?: string })`，请求 body 按第 0 步实测结果带 `instructions` 等参数；`voice` 优先取 `opts.voice`，否则 `cfg.voice`。
- `lib/tts.ts`：`synthesize(text, fileName, opts)` 内：
  - 随机选音色：`EN_TTS_VOICES[Math.floor(Math.random() * EN_TTS_VOICES.length)]`，经 `opts.out.voice` 回传（现有导入日志已会显示音色名）。
  - instruction 默认取配置，允许 `opts.instruction` 覆盖。
  - 支持 `opts.altText`：提供时用 altText 替代 text 参与合成（替代拼写纠音），不改变数据库里的单词文本。

### 3. 导入审批流

- `prisma/schema.prisma`：Book 模型增加 `audioApproved Boolean @default(false)`；status 注释增加 `pending_audio`（待批准生成音频）。执行 `npx prisma migrate dev` 生成迁移。
- `lib/import-runner.ts` `runImport`：分析阶段结束后、音频阶段开始前查 `book.audioApproved`：
  - `false` → 置 `status: "pending_audio"`，记导入日志"解析完成，等待管理员批准生成音频"，正常结束任务（队列继续下一本）。
  - `true` → 走现有音频批量生成逻辑（断点续传不变，管理员试生成过的词自动跳过）。
- `resumeImport`：入队时同时置 `audioApproved: true`（管理员手动恢复/一键补齐缺失音频属于显式批准，不再二次暂停）。
- 新增 `approveBookAudio(bookId)`：置 `audioApproved: true`、`status: "queued"`，从 `rawUnits` 恢复 units 并 `enqueueImport`（分析阶段全部跳过，直接进音频阶段）。
- 新 API 路由 `app/api/admin/audio/approve/route.ts`：`POST {bookId}` → requireAdmin → `approveBookAudio`。
- `app/api/admin/import-status/route.ts` 与图书状态展示：`pending_audio` 显示为"待批准音频"。

### 4. 管理员后台 UI（`app/admin/page.tsx`）

- **TTS 设置区（设置 tab）**：
  - 列出 4 个英语音色（Jennifer / Ryan / Katerina / Aiden），每个带"▶ 试听"按钮（复用 `POST /api/admin/tts-preview`，body 传指定 `voice`）。
  - 新增"合成指令（instruction）"输入框，随 TTS 设置保存（`ttsInstruction` → `tts_instruction`）。
  - 说明文案更新为千问平台（音色随机使用等）。
- **音频资源区（管理 tab）**：↻ 重新生成改为展开一个小面板：两个可选输入——"临时指令（instruction）"、"替代拼写（仅影响读音）"，确认后调 `POST /api/admin/audio`。
- **待批准区块（管理 tab，可放在导入实况区附近）**：列出 `status === "pending_audio"` 的书，每本显示"批准生成音频"按钮（调 approve 接口），并提示可先在音频资源区试生成几个词试听再批准。
- `app/api/admin/audio/route.ts` POST：body 增加可选 `instruction`、`altText`，透传给 `synthesize`。
- `app/api/admin/config/route.ts` PATCH：`strFields` 增加 `ttsInstruction: "tts_instruction"`。
- `app/api/admin/tts-preview/route.ts`：body 增加可选 `instruction`，合成时带上。

### 5. 验证

- `npx tsc --noEmit`、`npm run lint` 通过。
- curl 实测：4 个音色各合成一次、带 instruction 合成一次，确认返回正常 WAV。
- 本地起服务完整走一遍：
  1. 导入一本小书 → 分析完成后状态停在"待批准音频"，不生成音频。
  2. 音频资源区对该书试生成 2 个词（其中 1 个用替代拼写），试听确认读音。
  3. 点"批准生成音频" → 批量生成完成、状态 ready；导入日志可见不同音色名（随机生效）。
- 查 `node_modules/next/dist/docs/` 确认 route handler 等约定在 Next.js 16 无变化，与现有路由写法对齐。

### 6. 收尾

- 本次有 schema 变更 + 新路由 + 函数签名变化，按项目 AGENTS.md 用 codebase-memory-mcp 的 `index_repository`（mode: `moderate`）重建索引；`.codebase-memory/graph.db.zst` 随代码一并提交。
- 更新 AGENTS.md / CLAUDE.md 中过时的 TTS 描述（如有）。
- git 提交前先征得用户同意。

## 风险 / 注意

- 模型名 `qwen-audio-3.0-tts-flash`、音色名（Jennifer/Ryan/Katerina/Aiden）、文档域名与公开 dashscope 文档可能不一致 → 第 0 步实测兜底，不一致时如实反馈并按实测调整。
- instruction 参数名/传法以实测为准；不支持则降级不传。
- `pending_audio` 只对新导入生效；已有图书和"补齐缺失音频"按钮行为不变。
- Api Key 只进 `.env`，不写进代码或提交。
