# Codeforces API 现状（2026 记录）

## 端点

- `contest.ratingChanges?contestId=X`：返回每人 `handle/rank/oldRating/newRating`（均为显示分）。
  作为离线验证真值，也用于构建全局参赛索引。已实测可用。
- `contest.standings?contestId=X`：2026-04 曾被限制为仅 gym/mashup；现已恢复
  “匿名、仅一个 `contestId` 参数”的公开模式，返回完整官方榜单。不可附加
  `from/count/handles/showUnofficial`/鉴权等参数。直播阶段才需要。
- `user.rating?handle=X`：用户完整 rating 历史。可用于求 k，但**逐 handle 调用对上万人赛不可行**
  （限频 ~2s/次）。
- `user.info?handles=...`：批量当前显示 rating（未来直播取选手当前分用）。
- `contest.list?gym=false`：枚举常规比赛。

## k（赛前已完成 rated 场次）的求法

- **全量验证（本仓做法）**：抓取 `INDEX_FROM` 起所有比赛的 `ratingChanges`，构建
  `handle -> 参赛时间[]` 的全局索引，对任意 (handle, 比赛时间) 二分计数得 k。
  受新账号偏移影响的用户都在 2020-05 之后首战，故 `INDEX_FROM` 默认 2020-05-01 即可精确。
  **不需要** 逐 handle 调 `user.rating`。
- 样本检查点 `validate sample`：按成熟用户假设（k 视为 ≥6，偏移 0）快速校验核心算法，
  新账号会作为 mismatch 出现，仅用于算法 sanity，不代表最终精度。

## 注意

- API 返回的是“显示分”：`ratingChanges` 中出现过 `oldRating:0`（计算分不可能为 0），
  证明需要做显示分↔计算分换算。
- 限频：客户端约 1 req / 2.1s，并对 5xx / “limit exceeded” 做指数退避重试 + 磁盘缓存。
- 评分机制可能随时间变动：若某时段误差异常，可用 `CRP_VALIDATE_FROM` 缩小窗口并记录差异。
