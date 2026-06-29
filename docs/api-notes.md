# Codeforces API 与网页数据说明

本文件记录项目截至 2026-06-29 的实现依赖和已观察行为。Codeforces API/网页限制可能变化；如果未来行为变化，
应优先修正实现和测试，再同步更新本文。

## CLI 离线验证依赖

`@crp/cli` 的目标是用真实历史比赛验证算法：

- `contest.list?gym=false`：枚举常规比赛。
- `contest.ratingChanges?contestId=X`：返回每人 `handle/rank/oldRating/newRating`，作为离线验证真值。
- `user.rating?handle=X`：逐用户完整 rating 历史，仅用于慢速诊断命令，如 `checkk`、`diagperfect`。

CLI 不依赖 `contest.standings` 做离线验证。全量路径通过 `ratingChanges` 建立全局参赛索引：

- `CRP_INDEX_FROM` 默认 `2020-01-01`。
- `CRP_VALIDATE_FROM` 默认 `2022-01-01`。
- `ParticipationIndex.effectiveK()` 用“该 handle 最早一场 oldRating 是否为 0”判断是否为新评分体系账号。
  老体系账号一律按成熟账号处理（offset 0），避免把 2020 前老用户误判为新账号。

## Chrome 扩展依赖

`@crp/extension` 在内容脚本中使用三类数据源：

1. `contest.ratingChanges?contestId=X`
   - 已结束并计分的比赛优先使用该端点。
   - 非空时直接显示官方 `oldRating` 和 `newRating - oldRating`，不走预测。
   - 在 final standings 页面，如果 API 返回空/不可用，会尝试解析 `/contest/{id}/ratings` HTML。
2. `contest.standings?contestId=X&showUnofficial=false&from=1&count=10000`
   - 进行中或未结算比赛的优先预测数据源。
   - 内容脚本请求带 `credentials: include`，以复用当前 Codeforces 登录态。
   - 仅保留个人赛行；团队行跳过。
3. 当前 standings 页面 DOM 和分页 HTML
   - 当 standings API 不可用，或开启 debug 强制 DOM 预测时使用。
   - 会抓取 `/contest/{id}/standings/page/{page}`，最多 800 页。
   - 抓取使用自适应并发，遇 429/502/503/504 降速并重试。
   - 过滤 virtual / unofficial / out of competition 行，并按分数/罚时重新计算官方 rank。

选手当前 rating 通过 `user.info?handles=...` 获取：

- 每批最多 300 个 handle，最多 8 批并发，避免 URL 过长。
- 结果缓存到内存和 `chrome.storage.local`，TTL 为 6 小时。
- 无 rating 字段的用户视为未评分；扩展预测时按 1400 输入 core，Rating 列显示空值。

## 显示分与计算分

`contest.ratingChanges` 和 `user.info` 返回的是显示分。`@crp/core` 接受的是计算分。

- CLI 离线验证：用全局参赛索引求 `k`，再做 `displayToCalc` / `calcToDisplay`。
- 扩展直播预测：不逐个查询 `user.rating` 求精确 `k`，因此预测精度低于离线验证；这是浏览器实时路径的工程折中。

## 失败与降级语义

- CLI 的 `rating changes unavailable`、`unrated` 等情况会缓存为空结果，避免反复请求。
- 扩展遇网络错误、API `FAILED`、HTTP 503、`user.info` 失败时不破坏页面；内容脚本会放弃注入或显示空值。
- DOM 注入是幂等的：重复运行不会重复加列，设置变化时会先移除旧列再注入。

## 本地缓存

- CLI 原始 API 响应：`data/cache/`
- CLI 全量验证报告：`data/full-report.json`
- 扩展用户 rating 缓存：`chrome.storage.local` + 页面内存

`data/` 不提交到 Git。
