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
