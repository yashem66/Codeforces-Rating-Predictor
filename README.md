# Codeforces Rating Predictor

辅助 Codeforces 竞赛的工具集：核心是 **rating 预测算法**，目标是为浏览器插件在比赛 Standing
中展示 `Rating`（当前分）与 `Pred Rating Delta`（预估 rating 变化）。当前阶段聚焦**核心算法**
与**离线验证**（用真实比赛数据对齐官方结果）。

## 包结构（pnpm monorepo）

- `packages/core` — 零 I/O 纯算法库（浏览器/Node 通用）：Elo 概率、seed、CF 评分变化算法
  （朴素 O(N²) 基准版 + FFT O(N log N) 加速版）、新账号显示分↔计算分换算、表现分。
- `packages/cli` — Node 工具：抓取 CF 数据并缓存、从 `ratingChanges` 语料构建全局参赛索引
  反推每人赛前场次 k、调用 core、与官方真值对比并输出误差报告。

## 快速开始

```bash
pnpm install
pnpm test                       # 跑所有单测
pnpm --filter @crp/cli crp validate sample      # 样本检查点（成熟用户假设）
pnpm --filter @crp/cli crp validate-all         # 全量验证（2022+，正确处理新账号 k）
```

抓取的原始数据缓存在 `data/`（已 gitignore）。可用环境变量调整全量窗口：
`CRP_INDEX_FROM=YYYY-MM-DD`（索引起点，默认 2020-05-01）、`CRP_VALIDATE_FROM=YYYY-MM-DD`
（验证起点，默认 2022-01-01）。

## 算法要点

- 计算在“计算分（1400 基准）”空间进行；CF API 返回“显示分”，由 CLI 在边界做换算。
- 2020 新账号：计算分从 1400 起、显示分从 0 起，前 6 场显示分叠加 500/350/250/150/100/50。
- 详见 `docs/algorithm.md`；CF API 现状见 `docs/api-notes.md`。

## 设计与计划

- 设计：`docs/superpowers/specs/2026-06-28-rating-predictor-core-design.md`
- 计划：`docs/superpowers/plans/2026-06-28-rating-predictor-core.md`
- 验证结果：`docs/validation-results.md`

## License

MIT
