# Codeforces Rating Predictor — 核心算法 + 离线验证 + 基建 设计文档

- 日期：2026-06-28
- 状态：历史设计记录（已实现并演进；当前说明见 `README.md`、`docs/algorithm.md`、`docs/cli.md`、`docs/validation-results.md`）
- 作者：协作 brainstorming 产出

> 2026-06-29 刷新说明：本文保留当时的设计意图和决策背景，不再作为最新实施说明。当前实现已包含
> FFT 加速版、全量验证、Chrome 扩展、HTML/DOM fallback 和 Codex AI 基建。

## 1. 背景与目标

本仓库用于开发一个辅助 Codeforces 竞赛的 Chrome 插件：在比赛 Standing 中新增两列
`Rating`（该行用户当前 rating）与 `Pred Rating Delta`（预估 rating 变化）。

`Pred Rating Delta` 依赖核心能力——**Rating 预测计算**。本设计聚焦"先把核心算起来并验证准确"，
即先完成：核心预测算法库、离线验证/数据工具、仓库基建（含 Cursor Agent 文件与文档）。
Chrome 插件 UI 作为后续独立 spec，本期不实现，但核心算法接口会为其预留能力。

### 1.1 范围（In Scope）

1. **核心预测算法库**（纯函数、零 I/O，浏览器与 Node 均可复用）。
2. **离线验证 / 数据工具**（Node CLI）：抓取真实比赛数据、跑算法、与官方真值对比、产出误差报告。
3. **仓库基建**：monorepo 工程化、CI、文档、Cursor Agent 文件（`AGENTS.md`、`.cursor/rules/`）。

### 1.2 不在本期范围（Out of Scope，后续 spec）

- Chrome 插件 UI（DOM 注入两列、设置面板、直播实时刷新等）。
- FFT 性能优化（原本后续引入；当前已实现为 `computeRatingChangesFast`）。
- 直播实时预测里"为全体选手获取参赛场次 k"的工程化方案（成本较高，留待插件 spec）。

### 1.3 成功标准

- 在小样本数据集上，对**成熟用户（已完成 rated 场次 k≥6）逐人精确命中** delta。
- 汇总指标：中位 `|误差|` = 0；最大 `|误差|` 为取整级（≤1~2）；任何残余 mismatch 都有书面解释
  （新账号换算、平局、取整、边界情形）。
- 验证工具让准确度**可度量、可复现**，据此迭代算法细节直到误差 ≈ 0。

## 2. 关键调研结论（决定设计的依据）

### 2.1 2015 官方评分算法（blog/entry/20762）

- 多人版 Elo。胜率 `P(i 胜 j) = 1 / (1 + 10^((r_j - r_i)/400))`。
- 期望排名 `seed_i = 1 + Σ_{j≠i} P(j 胜 i)`。
- 取 `seed_i` 与实际排名的几何平均 `m_i = sqrt(seed_i * rank_i)`。
- 二分出表现分 `R`（使 `seed_i(R) = m_i`），rating 变化 `d_i = (R - r_i) / 2`。
- 通胀修正（327 轮后版本，两步）：
  1. `inc = -Σd_i / n - 1`，全员 `d_i += inc`（使总和≈0 且非正）。
  2. 取按 rating 降序的前 `s = min(n, 4*round(sqrt(n)))` 人，`sumTop = Σ这 s 人的 d_i`，
     `inc = min(max(-sumTop / s, -10), 0)`，全员 `d_i += inc`（单次修正最多下调约 10 分）。
- 业界参考实现：**Carrot**（meooow25，浏览器端，用 FFT 把期望排名计算降到 O(N log N)），
  其算法改编自 TLE 的 `rating_calculator.py`。

### 2.2 2020 新账号调整（blog/entry/77890）—— 影响准确度的核心难点

- 新账号"计算用 rating"从 **1400** 起，"显示 rating"从 **0** 起。
- 前 6 场显示分额外叠加 `500 / 350 / 250 / 150 / 100 / 50`（合计 1400），第 6 场后两者一致。
- 推导出"计算分 − 显示分"的偏移量（按**已完成 rated 场次 k** 索引）：
  `OFFSETS = [1400, 900, 550, 300, 150, 50]`，k ≥ 6 时为 0。
  - `calc = display + OFFSETS[k]`，`display = calc - OFFSETS[k]`。
  - 校验：k=0 时 `calc_old=1400`，赛后 `calc_new=1400+d1`，`display_new=calc_new-OFFSETS[1]=500+d1` ✓。
- 含义：参赛**不满 6 场**的用户显示分 ≠ 计算分，这是 Carrot"新系统后不再 100% 准确"的根源。
  研究级准确度必须正确换算。

### 2.3 Codeforces API 现状（2026，已实测）

- 论坛 2026-04 反馈 `contest.standings` 被限制；**实测**：`contest.standings?contestId=566`
  以"**匿名、仅一个 `contestId` 参数**"方式仍返回完整官方榜单（`{"status":"OK",...}`）。
  即当时观察到官方恢复了受限的匿名公开模式。当前扩展实现会优先尝试 standings API，并在不可用时回退 DOM/HTML 抓取；
  详见 `docs/api-notes.md`。
- **实测** `contest.ratingChanges?contestId=X` 正常，返回每人 `handle / rank / oldRating / newRating`。
  这是离线验证的**真值数据集**。
- **实测**：`ratingChanges` 中存在 `"oldRating":0`（计算分不可能为 0）→ 证明 **API 返回的是"显示分"**。
  因此验证链路需做"显示分↔计算分"换算。
- `user.info?handles=...` 可批量取当前显示 rating（用于未来直播获取选手当前分）。
- `user.rating?handle=X` 返回某用户完整 rating 历史（含 contestId 与时间），用于求"参赛场次 k"，可缓存。

## 3. 总体方案

采用 **方案 A + C**：monorepo + 纯算法核心包；core 接口按"既能离线验证、又能未来直播"前瞻设计，
但本期只实现并验证离线路径；算法先做**朴素正确版**（样本足够），FFT 留待全量阶段。

理由：核心算法最终要在浏览器运行，monorepo 把"纯算法"独立成包，可被 Node 验证工具与未来插件
**共用同一份实现**，避免两套实现不一致；纯函数零 I/O 也最易测试。

## 4. 仓库结构（pnpm monorepo）

```
Codeforces-Rating-Predictor/
├─ package.json                 # workspaces 根
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│  ├─ core/                     # @crp/core —— 纯算法，零 I/O
│  │  ├─ src/
│  │  │  ├─ elo.ts              # winProbability, seed
│  │  │  ├─ rating.ts           # computeRatingChanges（含两步通胀修正）
│  │  │  ├─ newAccount.ts       # OFFSETS 表与 display↔calc 换算
│  │  │  ├─ performance.ts      # performanceRating()
│  │  │  ├─ types.ts
│  │  │  └─ index.ts
│  │  └─ test/                  # vitest 单测（含小型 fixtures）
│  └─ cli/                      # @crp/cli —— Node 数据 + 验证工具
│     ├─ src/
│     │  ├─ api.ts              # CF API 客户端（限频、重试、匿名 GET）
│     │  ├─ cache.ts           # 磁盘缓存（data/）
│     │  ├─ dataset.ts          # 构建样本/全量数据集、比赛筛选
│     │  ├─ contestCounts.ts    # 解析每个 handle 在目标赛前的 rated 场次 k
│     │  ├─ validate.ts         # 跑 core vs 真值，计算误差指标
│     │  └─ cli.ts              # 命令入口：fetch / validate / report
│     └─ test/
├─ data/                        # gitignore 的本地缓存；小样本 fixtures 入 packages/*/test
├─ docs/
│  ├─ algorithm.md              # 算法说明 + 出处
│  ├─ api-notes.md              # CF API 现状（2026 限制 + 已确认匿名公开模式）
│  └─ superpowers/specs/        # 本设计文档
├─ AGENTS.md                    # Cursor Agent 指引
├─ .cursor/rules/               # 项目规则（mdc）
├─ .github/workflows/ci.yml     # typecheck + lint + test
├─ README.md
├─ .gitignore  .editorconfig  eslint/prettier 配置
└─ LICENSE                      # 已存在（MIT）
```

默认工具链（可在评审时调整）：\*\*pnpm workspaces + TypeScript strict + vitest + eslint + prettier

- GitHub Actions\*\*。

## 5. 核心算法 `@crp/core`（全部在"计算分"空间内运算）

### 5.1 类型

```ts
interface Contestant {
  party: string; // handle（或队伍标识）
  rank: number; // 实际排名；平局者共享相同 rank
  rating: number; // 计算分（1400 基准），由调用方换算后传入
}

interface RatingChange {
  party: string;
  rank: number;
  oldRating: number; // 计算分
  delta: number; // 计算分变化
  newRating: number; // 计算分
}
```

### 5.2 函数

- `winProbability(rj: number, ri: number): number` = `1 / (1 + 10**((rj - ri) / 400))`。
- `seed(rating: number, others: number[]): number` = `1 + Σ winProbability(other, rating)`。
- `computeRatingChanges(contestants: Contestant[]): RatingChange[]`：
  1. 计算各人 seed（基于全体）。
  2. `m_i = sqrt(seed_i * rank_i)`；**平局**直接采用传入的并列 rank（相同分数 rank 相同）。
  3. 二分表现分 `R_i`（使 `seed_i(R_i) = m_i`）；`d_i = (R_i - rating_i) / 2`。
  4. 修正①：`inc = -Σd / n - 1`，全员 `d += inc`。
  5. 修正②：`s = min(n, 4*round(sqrt(n)))`，按 rating 降序取前 s 人 `sumTop`，
     `inc = min(max(-sumTop / s, -10), 0)`，全员 `d += inc`。
  6. 返回各人 `delta / newRating`。
- `newAccount.ts`：`OFFSETS = [1400, 900, 550, 300, 150, 50]`；
  `displayToCalc(display, k)`、`calcToDisplay(calc, k)`（k≥6→偏移 0）。
- 预留（本期留桩/最小实现）：`performance(contestant, others)`（delta 为 0 时的 rating）、
- 当前实现提供 `performanceRating(rank, otherRatings)`；升档所需 delta 仍是后续方向，尚无公开 core API。

> 注：CF 参考实现存在若干实现细节（平局处理、取整时机、二分边界与精度、修正②中 `round` 的取法）。
> 本设计以"用离线验证逐项校准至误差≈0"为准；先按上述朴素实现，遇 mismatch 用最差案例清单定位修正。

## 6. 离线验证 `@crp/cli`

### 6.1 API 客户端（`api.ts`）

- 匿名 GET；全局限频（约 1 req / 2s）+ 指数退避重试；尊重 CF 限制。
- 端点：`contest.list`（枚举/筛选）、`contest.ratingChanges?contestId`（真值 + rank + 显示 oldRating/newRating）、
  `user.rating?handle`（求 k）。`contest.standings` 仅未来直播需要，本期可不依赖。

### 6.2 数据集与缓存（`dataset.ts` / `cache.ts`）

- 比赛筛选：FINISHED 的 **rated 个人赛**（Div1/2/3/4、Educational、Global 等），排除团队赛/不计分赛。
- 缓存：原始 API 响应落盘到 `data/`（gitignore），避免重复抓取与触发限频。
- 全量范围暂定 **2022-01 至今**；因评分机制可能变动，可**按需缩小窗口**做验证。
- 阶段：**先小样本**（如各档次各取数场，数十场）验证算法 → 调准后再扩到全量。

### 6.3 参赛场次 k 的解析（`contestCounts.ts`）

- 样本阶段：对样本内涉及的所有 handle 抓 `user.rating` 并缓存，按目标赛 `ratingUpdateTime`
  统计赛前历史条数即为 k（简单、可靠）。
- 全量阶段（后续）：在数据集内按时间顺序重建 k，仅当"该 handle 首战早于数据窗口"时回退查 `user.rating`。
  （成熟用户 k≥6 偏移为 0，无需精确 k；只有首 6 场用户需要精确 k。）

### 6.4 验证链路（`validate.ts`）

对单场比赛：

1. 取 `contest.ratingChanges` → 每人 `rank` + 显示 `oldRating` + 真值显示 `newRating`。
2. 用 k 把显示 `oldRating` → 计算分 `oldRating`。
3. 调 `core.computeRatingChanges` → 预测计算分 `newRating`。
4. 用 (k+1) 把预测计算分 `newRating` → 预测显示 `newRating`。
5. 与真值显示 `newRating` 比较。

### 6.5 指标与命令

- 指标：每场 & 汇总的 delta 精确命中率、`|误差|` 均值/中位/最大、误差直方图、最差 mismatch 清单。
  输出 JSON + 可读摘要。
- 命令：
  - `crp fetch [contestId|sample]`：抓取并缓存指定比赛或样本。
  - `crp validate [contestId|sample]`：跑算法并报告。
  - `crp fetch-all` / `crp validate-all`：全量缓存和验证。
  - `crp diag` / `crp checkk` / `crp diagperfect`：误差和 k 诊断。

## 7. 基建与 Cursor 文件

- `AGENTS.md`：项目概览、构建/测试/运行命令、约定（core 纯函数零 I/O、TS strict）、算法来源指引。
- `.cursor/rules/`：项目级规则（如 core 保持零 I/O；"声明完成前必须先跑验证"；提交规范）。
- `docs/algorithm.md`：算法详解 + 出处链接。
- `docs/api-notes.md`：API 现状记录（2026 限制、已确认匿名公开模式、各端点用途与限频）。
- `README.md`：项目简介 + 快速上手（安装、抓数、验证）。
- `.github/workflows/ci.yml`：install → typecheck → lint → test。
- `LICENSE`：已存在（MIT）。

## 8. 性能备注

算法先做朴素正确版（`seed` 为 O(N²)，样本规模足够）。扩到全量大赛（数万人）时，
引入 **FFT** 把期望排名计算降到 O(N log N)（Carrot 的做法），作为后续阶段，不影响接口。

## 9. 风险与开放项

- **平局/取整/二分精度**：CF 参考实现细节多，靠离线验证逐项校准；先以最差 mismatch 清单驱动修正。
- **API 限频/封禁**：严格限频 + 磁盘缓存；样本阶段数据量小，风险低。
- **新账号 k 的获取成本**：离线可控（缓存）；直播阶段成本高，留待插件 spec 设计折中方案。
- **评分机制历史变动**：若某时间段误差异常，缩小验证窗口并在 `api-notes.md`/`algorithm.md` 记录差异。

## 10. 参考资料

- 2015 评分算法：https://codeforces.com/blog/entry/20762
- 2020 新账号调整：https://codeforces.com/blog/entry/77890
- CF API 方法文档：https://codeforces.com/apiHelp/methods
- Carrot（参考实现）：https://github.com/meooow25/carrot
- TLE rating_calculator.py：https://github.com/cheran-senthil/TLE
