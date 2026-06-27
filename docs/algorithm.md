# Codeforces 评分算法说明

## 公式（计算分空间）

- 胜率：`P(I 胜 J) = 1 / (1 + 10^((rJ - rI) / 400))`
- 期望名次：`seed_i = 1 + Σ_{j≠i} P(j 胜 i)`
- 几何平均：`m_i = sqrt(seed_i * rank_i)`（rank_i 为实际名次，并列共享同名次）
- 表现分：二分 `R_i` 使 `seed(R_i) = m_i`；`d_i = trunc((R_i - r_i) / 2)`
- 修正①：`inc = trunc(-Σd / n) - 1`，全员加（使 Σd 接近 0 且非正）
- 修正②：按 rating 降序取前 `s = min(n, round(4√n))` 人，
  `inc = clamp(trunc(-Σd_s / s), -10, 0)`，全员加（高分组单次最多下调约 10 分）

实现：`packages/core/src/rating.ts`（朴素 O(N²)）与 `ratingFast.ts`（FFT O(N log N)）。
两者数学等价；FFT 版把 `S(R) = 1 + Σ_r cnt[r]·g(R-r)`（`g(x)=1/(1+10^(x/400))`）用一次
卷积预计算，再对每人 O(log) 二分。等价性由单测保证（随机场逐人误差 ≤ 1）。

## 2020 新账号规则

- 计算分从 1400 起，显示分从 0 起；前 6 场显示分叠加 500/350/250/150/100/50（共 1400）。
- “计算分 − 显示分”偏移（按已完成 rated 场次 k）：`[1400,900,550,300,150,50]`，k≥6 为 0。
- 验证链路：显示 oldRating --(k)--> 计算分 -> 算法 -> 计算分 newRating --(k+1)--> 预测显示
  newRating，与官方真值（显示分）对比。
- **重要性**：若忽略该换算，把新账号显示分（常为 0/很低）当计算分喂入，会拉低整个赛场 seed，
  使所有人预测偏移。样本检查点已实测验证此现象（Div1 误差小、含大量新账号的 Div2/3/4 误差大）。

## 已知近似与误差来源

- 成熟用户（k≥6）应逐人精确命中；残余误差主要来自：并列名次取值约定、取整时机、
  二分边界、极端低分被 [1,8000] 钳制、FFT 浮点（极小概率 ±1）。
- 用 `crp validate-all` 的最差 mismatch 清单驱动定位与修正，并记录到 `validation-results.md`。

## 出处

- 2015 算法：https://codeforces.com/blog/entry/20762
- 2020 新账号：https://codeforces.com/blog/entry/77890
- 参考实现 Carrot：https://github.com/meooow25/carrot
- TLE rating_calculator.py：https://github.com/cheran-senthil/TLE
