# 验证结果

本文件记录最近一次已整理进仓库文档的离线验证结论。完整全量验证依赖 Codeforces 网络、限频和本地缓存，
不是每次文档修改都会重新跑；需要刷新数值时执行 `pnpm --filter @crp/cli crp validate-all` 并同步更新本文。

## 方法

- 真值：`contest.ratingChanges`（每人 rank + 显示 oldRating/newRating）。
- 全局参赛索引：抓取 `CRP_INDEX_FROM` 起所有 rated 比赛的 `ratingChanges`，默认起点为
  `2020-01-01`。索引记录 `handle -> 参赛时间[]` 和每人最早一场的 `oldRating`。
- 新账号判定：只有“最早一场 oldRating == 0”的账号按新评分体系处理；老体系账号一律 offset 0。
- 验证链路：显示 oldRating --(k, displayToCalc)--> 计算分 -> 算法(FFT) -> 计算分 newRating
  --(k+1, calcToDisplay)--> 预测显示 newRating，与真值对比。
- 剔除：`newRating == 0` 的行政清零/取消资格异常。
- 验证窗口：默认 `CRP_VALIDATE_FROM=2022-01-01`。

## 全量结果（历史记录）

| 指标                  | 本实现（计算分换算） | 对照：Carrot 风格（显示分直用） |
| --------------------- | -------------------- | ------------------------------- |
| 比赛场数              | 510                  | 510                             |
| 总评分变化条数        | 6,847,554            | 6,847,554                       |
| 逐人 delta 精确命中率 | **9.49%**            | 2.22%                           |
| 加权平均绝对误差      | **8.19**             | 78.80                           |
| 最大绝对误差          | 631                  | 1153                            |

本实现的加权平均误差约为 Carrot 风格的 1/10。主要原因是离线路径正确处理了新账号“1400 计算分 +
显示 boost”，而 Carrot 类浏览器实时策略通常直接使用显示分，无法为全场精确求 `k`。

## 关键发现

- 成熟选手为主的比赛（Div1、小型赛，历史记录中 55 场 exactRate >= 0.9）逐人 delta 可 100% 精确，
  meanAbs=0。这说明 core 的公式、两步修正、平局处理和取整时机在成熟场景已对齐。
- 新账号密集的大赛（Div2/3/4，n 约 1 万到 3 万）仍有 meanAbs 约 20 到 30 的系统性梯度：
  低分偏高、高分偏低。
- 已排除的主要误差源：FFT 加速误差、`k` 大规模错判、行政清零异常。
- 残余差异疑似来自 Codeforces 现行实现中未公开的新账号/赛场 seed 细节。

## 已修复的问题

1. 平局名次方向：CF/TLE 对并列组使用“最差（最大）位置”，实现已改为
   `effectiveRank = rank + sameRankCount - 1`。
2. `zero_sum_count`：应为 `4 * round(sqrt(n))`，不是 `round(4 * sqrt(n))`。
3. 新账号 `k` 与体系判定：改为首场 `oldRating == 0` 才视为新体系账号，否则 offset 0。
4. 行政清零异常：`newRating == 0` 不是正常评分变化，验证时剔除。

## 复现命令

```bash
pnpm --filter @crp/cli crp validate sample
pnpm --filter @crp/cli crp validate-all
pnpm --filter @crp/cli crp diag <contestId>
pnpm --filter @crp/cli crp checkk <contestId>
pnpm --filter @crp/cli crp diagperfect <contestId>
```

环境变量：

- `CRP_INDEX_FROM=YYYY-MM-DD`
- `CRP_VALIDATE_FROM=YYYY-MM-DD`
- `CRP_NAIVE=1`：用朴素 O(N^2) 算法替代 FFT，用于排查加速实现是否影响结果。

## 当前结论

- core 算法在成熟用户场景可以精确复现官方 delta。
- 离线 CLI 通过全局参赛索引显著提升新账号场景精度，但仍无法完全解释 CF 当前未公开细节。
- 浏览器扩展的直播预测是实时可行折中：已结束赛显示官方真值；进行中赛显示预测值，尤其在新账号密集场景仅供参考。
