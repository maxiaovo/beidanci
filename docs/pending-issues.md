# 待修改问题列表（2026-08-11 全面检查）

状态标记：`[ ]` 未修 · `[x]` 已修 · `[~]` 暂不修（需设计决策/部署侧）
2026-08-11 修复批次：7 个并行代理 + 1 个收尾代理，修复后 `npm run check`（76 测试 + lint + build）全绿。

## P0 高危（全部已修）

- [x] P0-1 移动端拼写训练无输入元素 — TypingTrainer 加 visually-hidden input（onChange diff 兼容虚拟键盘），自动 focus，完成输入后出现「下一步」按钮
- [x] P0-2 「我的」页「单词书」死链 — 改为 `/#shelf`，首页书架区加 id="shelf"
- [x] P0-3 复习门禁减负 — 抽 `lib/study-gate.ts`：到期清空 OR 今日复习完成 ≥ dailyReviewTarget 即放行；新增 `dueTotal` 返回真实到期总数
- [x] P0-4 新词配额口径 — learnedToday/doneToday 改为 distinct wordId 且 result="correct"
- [x] P0-5 自由练习不动 SRS — postProgress 新增 practice 标志，服务端只写 StudyLog 不碰 WordProgress；练习采样排除手动已掌握词
- [x] P0-6 家长首页白屏竞态 — 先 await auth/me 判角色再拉学习数据，`?? []` 防御

## P1 学习逻辑

- [x] P1-1 cyclicRecovery 熔断 — `RECOVERY_FUSE_LIMIT = 5`，同词连错 5 次移出本场并上报新结果 "defer"（服务端推到明日 0 点，lapses+1，不动 stage），toast「这个词今天先到这里，明天再练」
- [x] P1-2 跳过语义 — 以最新 ReviewSkip.createdAt 为界：之前到期的词赦免，之后新到期的仍拦截
- [x] P1-3 learn wrong/giveup 只写 StudyLog 不建 WordProgress，词留在新词池
- [x] P1-4 strict 部分通过被利用 — session 下发 reviews 带 spellPassed/choicePassed，buildReviewTasks 跳过已过题型；initialRecovery 预置 done 保证答错清空后仍能补回
- [x] P1-5 strict 快照 — 客户端会话开始时读取并随每次上报带 strict 字段，服务端优先使用
- [x] P1-6 recoveryPass 不再计 reps（lapses 用于熔断计数）
- [ ] P1-7 progress 路由可见性校验已加（不可见 403）；**幂等未做**：网络重试导致重复 correct 仍会重复晋级（低概率，备查）
- [x] P1-8 scheduler 注释修正（stage 8 不再称"已掌握"）；books 接口 mastered 口径保持 stage>=8

## P2 代码质量 / 性能 / 安全

- [x] P2-1 书单 N+1 — total 复用 units._count.words，learned/mastered 单次 findMany JS 聚合，总查询恒为 2
- [x] P2-2 抽 `lib/streak.ts` getStudyStreak（desc 取 500 条提前终止），parent/admin 两处复用
- [x] P2-3 索引迁移 `20260811130324_add_perf_indexes`：StudyLog(userId,createdAt)、WordProgress(userId,nextReviewAt)
- [x] P2-4 删书竞态 — DELETE 先置 status="deleting"，import-runner `shouldAbort` 检查 stop 标志+书状态，干净退出
- [x] P2-5 cookie secure（production）；SESSION_SECRET 生产缺失直接抛错；新增 `AuthError`（401/403 区分），全站 26 处 catch 已统一
- [x] P2-6 导入文件 20MB 上限
- [~] P2-7 时区 — 代码口径统一为服务器本地时区；**部署侧待办**：NAS/VPS 容器固定 `TZ=Asia/Shanghai`（deploy-nas.sh / scripts/deploy.sh 环境）
- [x] P2-8 练习 SQL 层 ORDER BY RANDOM() LIMIT 20，排除手动掌握词
- [x] P2-9 writing version 事务内 MAX+1 + P2002 重试；错误对外只返通用文案
- [x] P2-10 learnedIds notIn → `progresses: { none: { userId } }` 关系过滤
- [x] P2-11 /api/daily-words 加登录校验
- [x] P2-12 封皮可见性 — lib/book-access.ts 新增 canAccessBook
- [x] P2-13 绑定/报告限额竞态收窄（事务内 re-check）
- [x] P2-14 登录异步 bcrypt + 内存滑动窗口限流（10 分钟 10 次 → 429）
- [x] P2-15 留言删除 P2025→404/500；401/403 全站统一
- [~] P2-16 站点图标 SVG 上传（仅 admin，低危）— 暂不处理
- [~] P2-17 progress read-decide-upsert TOCTOU（家庭场景概率极低，备查）

## P3 UX

- [x] P3-1 postProgress 返回 boolean，learn/check 失败时 toast「记录未保存，请检查网络」
- [x] P3-2 playAudio 返回 Promise<boolean>，AudioButton 失败时 🔇 + 「音频加载失败」气泡
- [x] P3-3 settings/parent/home 三处保存检查 r.ok，失败显示错误
- [x] P3-4 移出按钮常态可见（opacity-40→100），触控目标 40px
- [x] P3-5 parent/admin 数字保存前校验 + 按 min/max 夹取
- [x] P3-6 登录 required；注册头像未选禁用提交+就地提示；objectURL revoke
- [x] P3-7 家长页 w-full sm:w-96 + 表格 overflow-x-auto
- [x] P3-8 写作页「按住偷看」按钮（pointer 事件覆盖触摸+鼠标）
- [x] P3-9 切换孩子/用户先清 logs + loading 态
- [x] P3-10 learn 键盘导航守卫（豁免 TypingTrainer 的 data-typing-trainer input）
- [x] P3-11 「AI 老师批改中…」+ animate-pulse + 30 秒安抚文案；孩子端不再暴露 DeepSeek
- [x] P3-12 自由练习空态前置到模式选择之前
- [x] P3-13 注册页 regOpen===null 显示加载中
- [x] P3-14 移动端底部 Tab 加「写作」（家长侧锁定态）
- [x] P3-15 登录页「忘记密码？请联系家长/老师重置」
- [x] P3-16 头像缓存时间戳存 state，仅上传后更新
- [x] P3-17 admin 乐观切换失败回滚+提示；重置密码二次确认
- [x] P3-18 「强检查」→「双重检查」（孩子端）；摸底文案对齐真实行为（3 道小题、不限时）
- [~] P3-19 对比度/可访问性打磨（accent 2.9:1、aria、dialog 焦点、tablist 语义）— 设计决策，另行处理
- [~] P3-20 admin 页整体非响应式 — 定位桌面工具，暂不处理

## P4 测试缺口

- [x] P4-1 tests/scheduler.test.ts（clamp、封顶、阶梯）
- [x] P4-2 部分：lib/study-gate.ts 抽纯函数 + tests/study-gate.test.ts（门禁放行/拦截/达配额）；**路由级集成测试仍缺**
- [ ] P4-3 /api/progress 路由层测试（practice 不动调度、learn 不建 progress、defer、可见性 403）
- [ ] P4-4 客户端补考状态机 ↔ 服务端裁决跨层契约测试
- [ ] P4-5 自由练习语义的固化测试（practice=true 不改 stage/nextReviewAt）
- [ ] P4-6 master/unmaster 与调度交互测试
- [x] P4-7 熔断测试（5 次移出、答对清零）+ review-tasks 跳过已过题型测试
- [ ] P4-8 时区/跨天测试
- [ ] P4-9 skip-review 路由测试（writing 分支、当日重复跳过）

## 教育学改进（需产品决策，本轮未动）

- 检查维度偏窄：无听音辨词/听写，例句与音频在复习环节零利用
- 新词量与未来复习洪峰无反馈调节
- 非 strict 复习只用 defaultCheckMode 一种题型
- 学习报告 recovered 判定偏宽松；`lastResult` 字段只写不读
- settings 页自身的每日目标输入框客户端夹取未做（服务端 400 兜底）
