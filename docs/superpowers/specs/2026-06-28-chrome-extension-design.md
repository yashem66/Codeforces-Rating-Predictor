# Codeforces Rating Predictor — Chrome 插件 设计文档

- 日期：2026-06-28
- 状态：历史设计记录（已实现并演进；当前说明见 `docs/extension.md`、`docs/api-notes.md`）
- 前置：核心算法包 `@crp/core` 已完成并验证（见 `2026-06-28-rating-predictor-core-design.md` 与 `validation-results.md`）

> 2026-06-29 刷新说明：本文记录最初的 Chrome 扩展设计。当前实现已追加镜像域名匹配、final ratings
> HTML fallback、standings DOM fallback、自适应分页抓取、unofficial 行过滤、debug 强制 DOM 预测开关、
> rating 颜色和列宽样式。最新使用和维护说明见 `docs/extension.md`。

## 1. 目标

在 Codeforces 比赛 Standing 页面注入两列：

- **Rating**：该行选手的当前 rating。
- **Pred Rating Delta**：预估 rating 变化（进行中比赛）或实际变化（已结束比赛）。

复用 `@crp/core` 的评分算法（FFT 版）。纯客户端，仅与 Codeforces API 通信。

## 2. 框架与技术栈

- 位置：monorepo 新包 `packages/extension`。
- 构建：**Vite + @crxjs/vite-plugin**，Manifest V3，TypeScript（strict）。
- UI：**原生 DOM** 注入表格列（无需 React）；一个极简 **popup**（HTML+TS）做列开关与设置。
- 依赖：`@crp/core`（workspace:\*）。
- 测试：**vitest + jsdom**（纯逻辑单测 + 注入逻辑的 DOM 集成测试，喂样本 standings HTML + mock API）。
- 不引入后端；所有计算在浏览器内完成。

## 3. 适用页面与触发

- 匹配 URL：`*://codeforces.com/contest/*/standings*`（以及镜像 `*://*.codeforces.com/contest/*/standings*` 可选）。
- 从 URL 解析 `contestId`（`/contest/{id}/standings`）。
- 仅处理**个人赛**（标准 Div/Edu/Global）；团队赛、无 ratingChanges 的不计分赛跳过（显示提示或不注入）。

## 4. 数据流

### 4.1 已结束的 rated 比赛

1. 调 `contest.ratingChanges?contestId={id}`（匿名）。若返回非空 → 该赛已计分。
2. 用每行的 `oldRating` 填 “Rating” 列、`newRating-oldRating` 填 “Pred Rating Delta” 列（此为**真实值**，精确）。
3. 若返回空/unavailable → 视为未计分或未结算，回退到“进行中”逻辑或显示“未计分”。

### 4.2 进行中 / 未结算的比赛（预测）

1. 调 `contest.standings?contestId={id}`（匿名、仅一个参数）→ 取官方 `rows`（含 `party.members[].handle`、`rank`、`points`、`penalty`）。
2. 收集所有 handle，调 `user.info?handles=h1;h2;...`（**分批**，每批 ≤ 10000）→ 取每人当前显示 rating；**未评分用户**（无 rating 字段）记为新账号。
3. 构造 `Contestant[]`：`{ party: handle, rank, rating }`，其中 `rating = 未评分 ? 1400 : 当前显示 rating`。
   - 说明：完整的“新账号 1400 计算分 + 显示 boost”换算需要每人赛前场次 k；直播下无法对全体逐人取 `user.rating`（限频）。因此插件采用**直播可行精度**：未评分按 1400、其余用显示分（与 Carrot 同类策略，但正确处理未评分）。离线 CLI 才能达到更高精度（已记录在 validation-results）。
4. 调 `@crp/core` 的 `computeRatingChangesFast(contestants)` → 每人 `delta`。
5. “Rating” 列填当前 rating，“Pred Rating Delta” 列填预测 `delta`。

> 注：预测用**全量官方榜单**计算（标准），但只把结果**注入到当前页可见行**（按 handle 匹配）。翻页时重新注入（结果已缓存，无需重算）。

## 5. DOM 注入

- 定位 standings 表格（CF 的 `table.standings`）。
- 在表头插入两个 `<th>`（“Rating”“Pred Δ”），位置：紧跟选手名字列之后（具体列索引由实现探测，存在“=”行、room 列等需兼容）。
- 每个数据行按 handle 匹配，插入两个 `<td>`：Rating（数值），Pred Δ（带正负色：正绿、负红、0 灰，格式如 `+12` / `-8`）。
- 兼容：表头行、分隔行（`…`）、虚拟/编外选手行（标注或跳过）、多表（CF 有时上下各一表头）。
- 注入幂等：重复运行不重复加列（用 data 属性标记）。

## 6. Popup / 设置

- 极简 popup：两个开关（显示 Rating 列 / 显示 Pred Δ 列），存 `chrome.storage.local`。
- 内容脚本读取设置决定是否注入对应列；popup 改动后通知内容脚本刷新（或下次加载生效）。

## 7. 缓存与限频

- API 客户端：匿名 GET；对 `user.info` 分批；结果在内存 + `chrome.storage`（带 TTL，如 ratings 缓存数小时）缓存，减少重复请求。
- 错误处理：API 失败时不破坏页面（静默降级 + 控制台日志 + 可选小提示）。

## 8. 包结构（建议）

```
packages/extension/
├─ package.json            # @crp/extension, deps: @crp/core, vite, @crxjs/vite-plugin, typescript, vitest, jsdom
├─ vite.config.ts          # @crxjs 插件 + manifest
├─ manifest.config.ts      # MV3 manifest 定义（或 manifest.json）
├─ tsconfig.json
├─ src/
│  ├─ content/
│  │  ├─ main.ts           # 入口：检测页面 -> 取数 -> 计算 -> 注入
│  │  ├─ standings.ts      # 解析 contestId / 读取可见行 handle / 注入列
│  │  └─ inject.ts         # 表头/单元格 DOM 操作（幂等、着色）
│  ├─ lib/
│  │  ├─ cfApi.ts          # contest.ratingChanges / contest.standings / user.info（分批、缓存、限频）
│  │  ├─ predict.ts        # 组装 Contestant[] 并调用 @crp/core
│  │  └─ settings.ts       # chrome.storage 读写
│  ├─ popup/
│  │  ├─ popup.html
│  │  └─ popup.ts
│  └─ types.ts
└─ test/                   # vitest：predict、cfApi（mock fetch）、inject（jsdom 喂样本 HTML）
```

## 9. 验收标准

- `pnpm --filter @crp/extension build` 产出可加载的 MV3 解包扩展（dist 含 manifest + content + popup）。
- 单测 + jsdom 集成测试通过：给定 mock 的 standings 行 + ratings，注入逻辑产出正确的两列与数值/颜色。
- 已结束赛：注入的 delta 等于 `contest.ratingChanges` 真实值。
- 进行中赛：注入的 delta 等于 `@crp/core` 对全量榜单的预测。
- 幂等、降级（API 失败不破坏页面）、个人赛/团队赛判别正确。
- `pnpm -r test`、`pnpm typecheck`、`pnpm lint` 全绿。

## 10. 不在本期范围

- 直播下逐人 `user.rating` 精确 k（限频不可扩展）；如需更高精度，作为后续增强（对少量疑似新账号选择性取 user.rating）。
- performance 列、升档所需 delta 列（`performanceRating` 已存在；升档 delta 仍需后续 API 设计）。
- Firefox/移动端适配（先 Chrome）。
