# 开发说明

## 环境

- Node.js >= 18（CI 使用 Node 22）。
- pnpm 11.7.x（根 `package.json` 声明 `packageManager: pnpm@11.7.0`）。
- TypeScript strict。
- 测试框架：Vitest。
- 格式化：Prettier。
- Lint：ESLint 10 + typescript-eslint。

## 常用命令

```bash
pnpm install
pnpm -r test
pnpm -r build
pnpm typecheck
pnpm lint
```

包级命令：

```bash
pnpm --filter @crp/core test
pnpm --filter @crp/core typecheck
pnpm --filter @crp/cli test
pnpm --filter @crp/cli typecheck
pnpm --filter @crp/extension test
pnpm --filter @crp/extension typecheck
pnpm --filter @crp/extension build
```

## 包边界

- `@crp/core` 必须保持纯函数、零 I/O。不得引入 `node:`、`fs`、`fetch` 或浏览器 API。
- `@crp/cli` 可以使用 Node I/O、磁盘缓存和 Codeforces API。
- `@crp/extension` 可以使用浏览器 DOM、`fetch`、`chrome.storage`，并复用 `@crp/core`。

显示分↔计算分换算应发生在调用边界；core 内部始终只处理计算分。

## 测试策略

- core：算法性质、平局、FFT vs 朴素版等价、新账号换算。
- cli：API/cache、参赛索引、验证编排、报告聚合。
- extension：API 客户端、DOM 解析/注入、设置、popup、真实 HTML fixture、内容脚本端到端。

实现 feature/bugfix 时按 TDD：先写失败测试，再改实现，再跑相关测试。声明完成前必须跑过能证明结论的命令。

## Chrome 扩展交付

`@crp/extension` 代码变更后，除了测试和类型检查，还必须运行：

```bash
pnpm --filter @crp/extension build
```

否则 `dist/` 是旧产物，Chrome reload 后不会体现新代码。

## CI

`.github/workflows/ci.yml` 在 pull request 和手动触发时运行：

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm -r test`

PR 中 Markdown/docs-only 变更被 `paths-ignore` 跳过；需要时可用 `workflow_dispatch` 手动运行。

## 文档维护

实现行为变化时同步检查：

- `README.md`：项目入口、快速开始、文档地图。
- `AGENTS.md`：AI/人类都需要高频知道的命令和约定。
- `docs/algorithm.md`：core 算法或边界变化。
- `docs/api-notes.md`：CF API、HTML fallback、缓存、限频变化。
- `docs/cli.md`：CLI 命令、环境变量、缓存和报告变化。
- `docs/extension.md`：扩展数据流、DOM 注入、设置、构建/加载变化。
- `docs/validation-results.md`：重新跑全量验证后更新指标和结论。
- `docs/ai-maintenance.md`：Cursor/Codex/.agents 基建变化。

`docs/superpowers/` 中的 spec/plan 是历史决策记录。实现已经完成后，不要把它们改写成新的执行计划；
需要时加状态说明并指向当前专题文档。
