# Codeforces Rating Predictor

Codeforces Rating Predictor 是一个 TypeScript/pnpm monorepo，用于复现和应用 Codeforces rating
计算：

- `@crp/core`：零 I/O 的纯算法库，在“计算分（1400 基准）”空间复现 CF rating 变化。
- `@crp/cli`：Node 离线数据和验证工具，抓取/缓存真实比赛数据并与官方 `ratingChanges` 对齐。
- `@crp/extension`：Chrome MV3 扩展，在 Codeforces standings 页面注入 `Rating` 和 `Pred Δ` 两列。

当前主线已经从“核心算法 + 离线验证”推进到“可加载的 Chrome 扩展 + DOM/API 双路径预测”。历史设计和实现计划仍保留在
`docs/superpowers/`，最新使用说明以本 README 和 `docs/` 下的专题文档为准。

## 快速开始

```bash
pnpm install
pnpm -r test
pnpm typecheck
pnpm lint
```

常用包级命令：

```bash
pnpm --filter @crp/core test
pnpm --filter @crp/cli test
pnpm --filter @crp/extension test
pnpm --filter @crp/extension build
```

`@crp/extension` 改动后必须重新执行 `pnpm --filter @crp/extension build`，否则
`packages/extension/dist/` 仍是旧产物，Chrome reload 不会看到新代码。

## Chrome 扩展

构建后，在 Chrome 打开 `chrome://extensions`，开启 Developer mode，选择
`packages/extension/dist` 作为 unpacked extension。

扩展匹配：

- `codeforces.com/contest/*/standings*`
- `m1.codeforces.com` / `m2.codeforces.com` / `mirror.codeforces.com` 的同类 standings 页面

已结束并计分的比赛优先使用 `contest.ratingChanges` 真值；进行中或未结算比赛使用 standings + `user.info`
预测。若 standings API 不可用，内容脚本会回退到页面 DOM/分页 HTML 抓取，并过滤 unofficial/virtual 行。

详见 `docs/extension.md`。

## CLI 验证

抓取的原始数据缓存在 `data/cache/`，全量报告写入 `data/full-report.json`；`data/` 已被 gitignore。

```bash
pnpm --filter @crp/cli crp validate sample
pnpm --filter @crp/cli crp validate-all
pnpm --filter @crp/cli crp diag <contestId>
pnpm --filter @crp/cli crp checkk <contestId>
```

默认窗口：

- `CRP_INDEX_FROM=2020-01-01`：全局参赛索引起点。
- `CRP_VALIDATE_FROM=2022-01-01`：全量验证起点。
- `CRP_NAIVE=1`：用朴素 O(N^2) 算法替代 FFT 版做诊断。

详见 `docs/cli.md` 和 `docs/validation-results.md`。

## 文档地图

- `docs/algorithm.md`：评分算法、平局/取整/FFT 实现要点。
- `docs/api-notes.md`：项目当前依赖的 CF API、HTML fallback、缓存和限频约束。
- `docs/cli.md`：CLI 命令、环境变量、缓存和诊断流程。
- `docs/extension.md`：Chrome 扩展架构、加载方式、数据流、DOM 注入和排错。
- `docs/development.md`：开发、测试、CI、文档维护约定。
- `docs/ai-maintenance.md`：Cursor/Codex/AGENTS 等 AI 基建维护边界。
- `docs/superpowers/`：历史设计文档和执行计划，作为决策记录保留。

## 核心算法要点

- `@crp/core` 只接受计算分，不做 I/O，也不调用 `fetch`/`fs`/`node:`。
- Codeforces API 返回显示分；显示分和计算分的换算只在调用边界完成，离线验证主要由 `@crp/cli` 负责。
- CF 参考实现依赖整数截断除法；TypeScript 实现对应位置使用 `Math.trunc`。
- FFT 版 `computeRatingChangesFast` 用于大赛，单测持续对照朴素版，允许极小浮点误差导致的 ±1 差异。

## License

MIT
