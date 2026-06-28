# Chrome 插件 实现计划（分发给子代理）

**Goal:** 在 CF Standing 注入 “Rating” 与 “Pred Rating Delta” 两列，复用 `@crp/core`。

**Architecture:** `packages/extension`（Vite + @crxjs/vite-plugin, MV3, TS）。内容脚本取数→调 core→注入 DOM；popup 控开关。已结束赛用 ratingChanges 真值，进行中赛用 standings+user.info 预测。

**环境约定（必读）：** 见仓库根 `AGENTS.md`。所有 Shell 命令必须带 `required_permissions: ["all"]`；用 **pnpm**；PowerShell 下不要用 `tail/head/grep`。安装新依赖用 `pnpm --filter @crp/extension add ...`；如遇 `ERR_PNPM_IGNORED_BUILDS`，在根 `pnpm-workspace.yaml` 的 `allowBuilds` 增加对应包=true 后 `pnpm install`。

---

## 阶段 A（开发，dev 子代理）

### Task A1: 脚手架 + 构建
- 创建 `packages/extension/package.json`（name `@crp/extension`, private, type module；deps `@crp/core: workspace:*`；devDeps 用 `pnpm add -D` 安装 `vite @crxjs/vite-plugin typescript vitest jsdom @types/chrome`）。
- `vite.config.ts` 用 `@crxjs/vite-plugin`；`manifest.config.ts` 定义 MV3：
  - `manifest_version: 3`，name/version/description。
  - `content_scripts`: matches `["*://codeforces.com/contest/*/standings*"]`, js `["src/content/main.ts"]`, run_at `document_idle`。
  - `host_permissions`: `["*://codeforces.com/*"]`。
  - `permissions`: `["storage"]`。
  - `action`: default_popup `src/popup/popup.html`。
- `tsconfig.json` extends `../../tsconfig.base.json`，加 `"types": ["chrome","node"]`，include src。
- 脚本：`build`(vite build)、`dev`(vite)、`test`(vitest run)、`typecheck`(tsc --noEmit)。
- 验证：`pnpm --filter @crp/extension build` 产出 dist（含 manifest.json、content、popup）。

### Task A2: CF API 客户端 `src/lib/cfApi.ts`（含单测）
- 函数：`getRatingChanges(contestId)`、`getStandings(contestId)`、`getUserInfos(handles: string[])`（按 ≤10000 分批，合并）。
- 匿名 GET `https://codeforces.com/api/...`；解析 `{status, result|comment}`；FAILED 抛错（`unavailable/unrated/not found` 类 → 返回空，便于判定未计分）。
- ratings 缓存：内存 Map + `chrome.storage.local`（TTL 数小时，键含 handle）。在测试环境无 chrome 时降级为仅内存。
- 单测（mock `fetch`、stub `chrome`）：OK 解析、分批合并、unavailable→空、缓存命中不二次请求。
- 返回类型在 `src/types.ts`：`ApiRatingChange`（复用 cli 同结构）、`StandingsRow {handle, rank, points, penalty}`、`UserInfo {handle, rating?: number}`。

### Task A3: 预测组装 `src/lib/predict.ts`（含单测）
- `buildContestants(rows: StandingsRow[], ratings: Map<string, number|undefined>): Contestant[]`：
  `rating = ratings.get(handle) ?? 1400`（未评分→1400）。`{party:handle, rank, rating}`。
- `predictDeltas(rows, ratings): Map<handle, number>`：调 `computeRatingChangesFast`，返回 handle→delta。
- `finalDeltas(ratingChanges): Map<handle, {rating, delta}>`：已结束赛直接由 ratingChanges 得 rating=oldRating、delta=newRating-oldRating。
- 单测：未评分→1400；预测与 core 一致；finalDeltas 取值正确。

### Task A4: DOM 注入 `src/content/inject.ts`（含 jsdom 单测）
- `injectColumns(table: HTMLTableElement, data: Map<handle, {rating?: number, delta?: number}>, opts: {showRating, showDelta})`：
  - 幂等：用 `data-crp` 标记已注入的 th/td，重复调用不重复加列。
  - 表头：在“选手名”列后插入 `<th>Rating</th>`、`<th>Pred Δ</th>`（按 opts 决定是否插）。
  - 数据行：从行中提取 handle（CF 行内 `a[href*="/profile/"]` 或 `participantId`），匹配 data，插入两个 `<td>`；delta 着色：>0 绿、<0 红、=0 灰，文本 `+12`/`-8`/`0`；缺失数据填 `—`。
  - 兼容表头行、分隔/`…`行、无 handle 行（跳过）。
- jsdom 单测：构造样本 standings `<table>`（含表头 + 几行带 profile 链接 + 一行无 handle），调用注入，断言：列数、各行单元格文本与 class（颜色）、幂等（二次调用列数不变）。

### Task A5: 内容脚本入口 `src/content/main.ts` + `src/content/standings.ts`
- `main.ts`：解析 contestId；读设置；先试 `getRatingChanges`→非空则 finalDeltas（真值模式），否则 `getStandings`+`getUserInfos`→predictDeltas（预测模式）；定位所有 `table.standings`；调 `injectColumns`。失败静默降级 + console。
- `standings.ts`：`parseContestId(url)`、`findStandingsTables()`、`extractHandle(rowEl)`。给这些纯函数写 jsdom 单测。
- 监听翻页/动态变化可选（先简单：document_idle 注入一次）。

### Task A6: Popup + 设置 `src/popup/*` + `src/lib/settings.ts`
- `settings.ts`：`getSettings()`/`setSettings()`（chrome.storage.local，默认 showRating=true、showDelta=true）；无 chrome 时返回默认。
- `popup.html`+`popup.ts`：两个 checkbox 绑定设置；保存后可提示“刷新页面生效”。
- 单测：settings 默认值/读写（stub chrome.storage）。

### 阶段 A 验收：`pnpm --filter @crp/extension build && pnpm --filter @crp/extension test && pnpm --filter @crp/extension typecheck` 全绿；dist 可解包加载。每完成一个 Task 即提交（Conventional Commits）。

---

## 阶段 B（测试加固，test 子代理）
- 审阅阶段 A 实现，补齐**集成测试**（jsdom）：完整模拟一次内容脚本流程——mock `fetch`（standings + user.info 或 ratingChanges）+ stub `chrome` + 样本 DOM → 跑入口逻辑 → 断言两列被正确注入、数值等于 core 预测/真值、颜色正确、幂等、降级（fetch 失败时页面不报错且不加坏列）。
- 边界：团队赛（多 member）跳过；未计分赛（ratingChanges 空且 standings 取不到）降级；未评分用户→1400 体现在预测。
- 跑 `pnpm -r test`、`pnpm typecheck`、`pnpm lint` 全绿；补充缺失断言；提交。

## 阶段 C（验收，acceptance 子代理 / code-reviewer）
- 对照本计划与 spec 第 9 节逐条核验：构建产物结构、manifest 正确性（matches/permissions/action）、两列行为（真值/预测）、幂等、降级、个人/团队判别、设置开关。
- 运行 `pnpm --filter @crp/extension build` 检查 dist 内容；运行全量测试/lint/typecheck。
- 输出验收报告：通过项、未达项、风险与建议。如有阻断问题，明确指出供主代理派回修复。

---

## 备注
- 直播预测精度为“显示分 + 未评分 1400”（可行精度）；更高精度需逐人 user.rating（不可扩展），不在本期。
- 不改动 `@crp/core` 公共接口；如需新增 core 能力（如 deltaToRankUp）另开任务。
