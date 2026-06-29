# Chrome 扩展说明

`@crp/extension` 是 Vite + `@crxjs/vite-plugin` 构建的 Chrome Manifest V3 扩展。它在 Codeforces
standings 页面注入两列：

- `Rating`：当前或赛前 rating。
- `Pred Δ`：预测 rating delta；已结束并计分比赛中为官方真实 delta。

## 构建和加载

```bash
pnpm --filter @crp/extension build
```

然后在 Chrome 打开 `chrome://extensions`：

1. 开启 Developer mode。
2. 选择 Load unpacked。
3. 选择 `packages/extension/dist`。

修改扩展代码后必须重新 build，并在 Chrome 扩展页 reload。

## 匹配页面和权限

内容脚本匹配：

- `*://codeforces.com/contest/*/standings*`
- `*://m1.codeforces.com/contest/*/standings*`
- `*://m2.codeforces.com/contest/*/standings*`
- `*://mirror.codeforces.com/contest/*/standings*`

host permissions 覆盖对应域名。API/HTML 请求使用 `credentials: include`，以复用当前 Codeforces 登录态。

## 数据流

### 已结束并计分比赛

1. 读取 `contest.ratingChanges?contestId={id}`。
2. 如果返回非空，直接使用官方真值：
   - `Rating = oldRating`
   - `Pred Δ = newRating - oldRating`
3. 如果页面是 final standings，但 API 返回空/不可用，尝试解析 `/contest/{id}/ratings` HTML。

这种路径不需要预测，因此也不受浏览器端 `k` 不精确的影响。

### 进行中或未结算比赛

1. 优先读取 `contest.standings`，参数为 `contestId/showUnofficial=false/from=1/count=10000`。
2. 如果 standings API 不可用，回退到当前页面 DOM 和分页 HTML 抓取。
3. 用 `user.info` 批量获取当前显示 rating。
4. 构造 `Contestant[]`：
   - 有 rating 的用户使用当前显示 rating。
   - 无 rating 字段的未评分用户按 1400 输入 core。
5. 调用 `computeRatingChangesFast()` 预测 delta。
6. 只把结果注入当前页面可见表格，按 handle 匹配。

浏览器直播预测不会为全场逐个查询 `user.rating` 来精确求赛前 `k`，因此新账号密集比赛的预测仅供参考。

## DOM fallback

DOM fallback 由 `src/content/standings.ts` 实现：

- 从 `table.standings` 解析 handle、rank、points、penalty。
- 抓取最多 800 个 standings 分页。
- 使用自适应并发；遇 429/502/503/504 会降速、暂停并重试。
- 过滤 unofficial、virtual、practice、out-of-competition 行。
- 合并分页后按 points/penalty 重新计算官方 rank，避免过滤 unofficial 后污染预测。
- 抓榜期间并行预取 `user.info`，减少最终等待时间。

## DOM 注入

注入逻辑由 `src/content/inject.ts` 实现：

- 列插入在选手列之后，兼容 `Who`、`handle`、`=`、俄文表头和真实 CF 嵌套结构。
- `Rating` 按 CF 段位着色。
- `Pred Δ` 正数绿色、负数红色、0 灰色。
- 缺失数据用 `—`。
- unofficial 行即使存在同名数据，也显示空值，避免把官方预测写到非官方行。
- 注入幂等：重复运行不会重复加列；设置变化会清除旧列后重注入。

## Popup 设置

`src/popup/popup.html` / `popup.ts` 提供三个开关：

- 显示 Rating 列。
- 显示 Pred Δ 列。
- Debug：强制 DOM 抓取并走预测路径。

设置保存在 `chrome.storage.local`。保存后需要刷新 standings 页面生效。

## 缓存

- `user.info` 结果缓存到内存和 `chrome.storage.local`。
- 缓存 key 为 `userRating:<handle>`。
- TTL 为 6 小时。
- 无 rating 的用户缓存为 `null`，避免重复请求未评分用户。

## 测试

```bash
pnpm --filter @crp/extension test
pnpm --filter @crp/extension typecheck
pnpm --filter @crp/extension build
```

测试覆盖：

- API 成功、失败、HTML rating fallback、缓存。
- standings DOM 解析、unofficial 过滤、分页抓取、并发节流和重试。
- `buildContestants` / `predictDeltas` / `finalDeltas`。
- 注入列的幂等、颜色、空值、真实 CF fixture 结构。
- 内容脚本端到端：已结束赛真值、进行中预测、团队赛、未评分用户、网络错误、设置开关、debug DOM 模式。

## 排错

- 扩展 reload 后仍无变化：确认已重新运行 `pnpm --filter @crp/extension build`，并加载的是
  `packages/extension/dist`。
- 页面无列：检查 popup 是否关闭了两列；检查 Console 中 `[CRP]` 日志。
- 已结束赛没有真值：可能 `ratingChanges` 未发布，或 HTML ratings 页面结构变化。
- 进行中大赛很慢：DOM fallback 需要抓取分页和批量 ratings；Console 会输出抓页进度和自适应并发。
- unofficial 行显示 `—`：这是预期行为，避免把官方预测污染到 virtual/out-of-competition 行。
