# 验证结果

## 方法

- 真值：`contest.ratingChanges`（每人 rank + 显示 oldRating/newRating）。
- 全局参赛索引：抓取 2020-01 起所有 rated 比赛的 `ratingChanges`，构建 `handle -> 参赛时间[]`，
  并记录每人“最早一场的 oldRating”。据此反推每人赛前场次 k，并用“首场 oldRating==0”判定是否
  新评分体系账号（老体系账号一律 offset 0）。
- 验证链路：显示 oldRating --(k, displayToCalc)--> 计算分 -> 算法(FFT) -> 计算分 newRating
  --((k+1), calcToDisplay)--> 预测显示 newRating，与真值对比。剔除 `newRating==0` 的行政清零异常。
- 窗口：验证 2022-01 至今全部 rated 个人赛（共 510 场）。

## 全量结果（`crp validate-all`）

| 指标 | 值 |
| --- | --- |
| 比赛场数 | 510 |
| 总评分变化条数 | 6,847,554 |
| 逐人 delta 精确命中率 | 9.49% |
| 加权平均绝对误差 | 8.19 |
| 最大绝对误差 | 631 |

分档观察（以 Div2 contest 1832 为例，按 oldRating 分档的 signed/abs 误差）：
成熟为主的高分档 meanAbs ≈ 2；新账号密集的低分档 meanAbs ≈ 6–8、并呈“低分偏高、高分偏低”的梯度。

## 排查与已修复的问题（迭代历程）

1. **平局名次方向**（关键）：CF/TLE 对并列组使用“最差（最大）位置”，而最初用了 API 的最小位置。
   已修正为 `effRank = rank + (相同 rank 人数) - 1`。
2. **`zero_sum_count`**：应为 `4*round(sqrt(n))`，最初写成 `round(4*sqrt(n))`。已修正。
3. **新账号 k 与体系判定**（关键，最大提升）：最初按 2020-05 起的索引反推 k，导致**2020-05 前
   开赛的老用户**在窗口内参赛<6 次时被误判为新账号、错误叠加显示 boost，其异常的巨额 delta 经
   correction1 抬高全场。改为“首场 oldRating==0 才算新体系账号，否则 offset 0”后，
   weightedExactRate 从 ~2.6% 提升到 ~9.5%、加权 meanAbs 大幅下降。
4. **行政清零异常**：`newRating==0`（取消资格/作弊清零）不是正常评分变化，已从验证中剔除，
   maxAbsError 从 2823 降到 631。

## 仍存在的差距与原因分析

- **correction1 的全场耦合**：`inc = trunc(-Σd/n) - 1` 对全体加同一常数。只要少数选手的 calc
  略有偏差（k/体系判定的残余误差），就会改变 Σd，使全场每人偏移 1–2 分。小型比赛尤其敏感
  （观察到顶部选手在 k 修复前后摆动达数十分）。因此“逐人精确”要求**全场每个人的 calc 完全正确**。
- **公开公式与 CF 现行实现的差异**：新账号密集比赛存在随 rating 变化的系统性梯度，疑为 2015 公式
  之后未公开的微调所致。Carrot 亦声明“新评分体系后不再 100% 准确”。

## 达成“逐人精确”的可选路径

1. **逐用户权威数据**：对每位选手调 `user.rating` 取精确 k 与首场体系判定。最准确，但限频 ~2s/次，
   对上万人的单场需数小时，仅适合小规模/离线子集，不可在直播或全量中扩展。
2. **接受 Carrot 级精度**（当前）：加权 meanAbs ≈ 8，绝大多数成熟选手误差很小；与业界 Carrot 同档。
3. **深入逆向 CF 现行实现**：针对低分/新账号梯度继续比对，尝试复现未公开微调（成本高、收益不确定）。

## 复现命令

```bash
pnpm --filter @crp/cli crp validate-all     # 全量验证（默认窗口 2022-01 起）
pnpm --filter @crp/cli crp diag <contestId> # 单场按 rating 分档的误差诊断
pnpm --filter @crp/cli crp checkk <contestId>     # 抽样核对索引 k vs user.rating 真值
pnpm --filter @crp/cli crp diagperfect <contestId># 用 user.rating 取完美 k 后验证（慢，小场用）
```
