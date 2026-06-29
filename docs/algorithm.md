# Codeforces 评分算法说明

本文描述 `@crp/core` 当前实现的算法。core 始终运行在“计算分（calculation rating，1400 基准）”空间，
不读取文件、不访问网络，也不关心 Codeforces API 返回的显示分。显示分和计算分的换算由调用边界处理：
离线验证在 `@crp/cli` 中处理，浏览器扩展直播预测采用可行的近似输入。

## 公式（计算分空间）

对每个参赛者 `i`：

- 胜率：`P(I 胜 J) = 1 / (1 + 10^((rJ - rI) / 400))`
- 期望名次：`seed_i = 1 + Σ_{j≠i} P(j 胜 i)`
- 平局处理：同一 rank 的并列组使用“最差（最大）位置”，即
  `effectiveRank = rank + sameRankCount - 1`
- 几何平均：`m_i = sqrt(seed_i * effectiveRank_i)`
- 表现分：二分 `R_i` 使 `seed(R_i) = m_i`
- 初始变化：`d_i = trunc((R_i - r_i) / 2)`
- 修正 1：`inc = trunc(-Σd / n) - 1`，全员加 `inc`
- 修正 2：按 rating 降序取前 `s = min(n, 4 * round(sqrt(n)))` 人，
  `inc = clamp(trunc(-Σd_s / s), -10, 0)`，全员加 `inc`

`Math.trunc` 是有意选择：CF/TLE 参考实现中的整数除法按向零截断工作，不能替换成 `Math.floor`。

## 实现位置

- `packages/core/src/rating.ts`：朴素 O(N^2) 基准实现，便于对照和调试。
- `packages/core/src/ratingFast.ts`：FFT O(N log N) 加速实现，用于大赛和扩展预测。
- `packages/core/src/newAccount.ts`：2020 新账号显示分↔计算分换算。
- `packages/core/src/performance.ts`：表现分相关工具。

FFT 版把

`S(R) = 1 + Σ_r cnt[r] * g(R-r)`，其中 `g(x)=1/(1+10^(x/400))`

用一次卷积预计算，再对每人二分。单测持续对照朴素版：小场景逐人完全一致，随机中型场景最大逐人误差
不超过 1。

## 2020 新账号规则

2020 后的新账号存在显示分和计算分差异：

- 计算分从 1400 起，显示分从 0 起。
- 前 6 场显示分额外叠加 `500 / 350 / 250 / 150 / 100 / 50`，合计 1400。
- “计算分 - 显示分”偏移按已完成 rated 场次 `k` 取：
  `[1400, 900, 550, 300, 150, 50]`，`k >= 6` 后为 0。

换算函数：

- `displayToCalc(display, k) = display + offset[k]`
- `calcToDisplay(calc, k) = calc - offset[k]`

验证链路：

1. 从 `contest.ratingChanges` 读取显示 `oldRating/newRating`。
2. 用赛前 `k` 把显示 oldRating 换成计算分。
3. 调 core 得到计算分 newRating。
4. 用 `k + 1` 把预测计算分换回显示分。
5. 与官方显示 newRating 比较。

## 调用方边界

- `@crp/cli` 为离线精确验证构建全局参赛索引，能较准确地求每个 handle 的赛前 `k`。
- `@crp/extension` 在浏览器直播预测时无法为全体选手逐个查询 `user.rating`，因此采用当前显示 rating；
  未评分用户按 1400 作为计算输入。该策略可扩展、速度可接受，但不等同于离线精确验证。
- 已结束并计分的比赛中，扩展优先使用 `ratingChanges` 真值，此时 `Pred Δ` 实际显示官方 delta。

## 已知误差来源

- 新账号密集大赛仍可能存在公开公式之外的系统性差异。
- 少数人计算分偏差会通过修正 1 的全场耦合影响所有人 1 到 2 分。
- FFT 浮点误差极少数情况下可能带来 ±1 差异。
- Codeforces 的网页/API 行为可能随时间变化；相关工程约束记录在 `docs/api-notes.md`。

## 出处

- 2015 算法：https://codeforces.com/blog/entry/20762
- 2020 新账号：https://codeforces.com/blog/entry/77890
- Carrot 参考实现：https://github.com/meooow25/carrot
- TLE rating_calculator.py：https://github.com/cheran-senthil/TLE
