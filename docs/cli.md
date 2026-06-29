# CLI 说明

`@crp/cli` 是 Node 数据和验证工具，负责抓取 Codeforces 数据、缓存 API 响应、构建全局参赛索引，并把
`@crp/core` 的预测结果与官方 `contest.ratingChanges` 真值对比。

## 运行方式

```bash
pnpm --filter @crp/cli crp <command> [contestId|sample]
```

所有抓取缓存默认位于 `data/cache/`，全量验证报告写入 `data/full-report.json`。

## 命令

### `fetch [contestId|sample]`

抓取并缓存指定比赛或样本比赛的 `contest.ratingChanges`。

```bash
pnpm --filter @crp/cli crp fetch sample
pnpm --filter @crp/cli crp fetch 1900
```

### `validate [contestId|sample]`

验证指定比赛或样本比赛。样本路径按成熟用户假设快速校验核心算法；新账号会出现在 mismatch 中。

```bash
pnpm --filter @crp/cli crp validate sample
pnpm --filter @crp/cli crp validate 1900
```

### `fetch-all`

枚举 `CRP_INDEX_FROM` 到当前时间的已结束比赛，并缓存每场 `ratingChanges`。

```bash
pnpm --filter @crp/cli crp fetch-all
```

### `validate-all`

执行两遍全量验证：

1. 枚举并读取全部比赛，建立 `ParticipationIndex`。
2. 对 `CRP_VALIDATE_FROM` 之后的非空比赛逐场验证，并汇总指标。

```bash
pnpm --filter @crp/cli crp validate-all
```

输出会写入 `data/full-report.json`。

### `diag <contestId>`

对单场比赛输出按 rating 分档的误差诊断，并打印若干成熟用户的预测 delta vs 官方 delta。

```bash
pnpm --filter @crp/cli crp diag 1900
```

### `checkk <contestId>`

抽样调用 `user.rating`，核对全局索引求出的 `effectiveK` 是否等于权威历史。

```bash
pnpm --filter @crp/cli crp checkk 1900
```

该命令会触发逐用户请求，受 Codeforces 限频影响。

### `diagperfect <contestId>`

对该场所有选手尽量使用 `user.rating` 求“完美 k + 新体系判定”，再验证算法误差。

```bash
pnpm --filter @crp/cli crp diagperfect 1900
```

这是慢速诊断命令，上万人比赛不适合常规运行。

## 环境变量

- `CRP_INDEX_FROM=YYYY-MM-DD`：全局参赛索引起点，默认 `2020-01-01`。
- `CRP_VALIDATE_FROM=YYYY-MM-DD`：全量验证起点，默认 `2022-01-01`。
- `CRP_NAIVE=1`：用 `computeRatingChanges` 朴素版替代 FFT 版，用于排查 FFT 是否引入误差。

## 验证链路

单场验证流程：

1. 读取 `contest.ratingChanges`。
2. 从 `ParticipationIndex` 得到每位选手赛前 `effectiveK`。
3. 将显示 `oldRating` 转换为计算分。
4. 调 `@crp/core` 计算预测变化。
5. 将预测计算分 `newRating` 转回显示分。
6. 与官方显示 `newRating` 对比。

`newRating == 0` 的行政清零/取消资格异常不参与正常误差统计。

## 缓存和限频

`CodeforcesApi` 通过 `JsonCache` 缓存 API 响应，避免重复触发限频。`ratingChanges` 不可用/未计分等空结果也会缓存。

如果需要清空缓存，手动处理 `data/cache/`；不要提交 `data/`。
