# AGENTS.md

## Shell 执行要求（必读）

本机不支持 Shell 沙盒，所有 Shell 命令必须带 `required_permissions: ["all"]` 执行，否则一律返回 `no exit status`。

不要在 `no exit status` 上排查执行策略、Shell 集成、杀软、重启等——根因就是沙盒不支持，加该参数即可。

环境补充：包管理器用 **pnpm**（已全局安装）；PowerShell 下没有 `tail`/`head`/`grep` 等 Unix 命令，
不要在命令里用它们（工具会自动保存完整输出，无需截断）。

## 项目概览

TypeScript monorepo（pnpm workspaces）。`packages/core` 为零 I/O 纯算法库；`packages/cli` 为
Node 数据/验证工具。核心目标：高精度复现 Codeforces rating 计算，并用真实比赛离线验证。

## 常用命令

- 安装：`pnpm install`
- 全部测试：`pnpm -r test`
- 单包测试：`pnpm --filter @crp/core test` / `pnpm --filter @crp/cli test`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 样本验证：`pnpm --filter @crp/cli crp validate sample`
- 全量验证：`pnpm --filter @crp/cli crp validate-all`

## 约定

- `@crp/core` 必须保持纯函数、零 I/O（不得引入 `node:`/`fs`/`fetch`），以便浏览器复用。
- rating 计算在“计算分（1400 基准）”空间；显示分↔计算分换算只在 `@crp/cli` 边界做。
- CF 参考实现用整数截断除法，对应 TS 代码处一律用 `Math.trunc`，否则会出现 ±1 误差。
- TDD：先写失败测试再实现。声明“完成/通过”前必须实际跑过测试。
- 提交用 Conventional Commits（feat/fix/docs/chore/test）。

## 关键资料

- 算法说明与出处：`docs/algorithm.md`
- CF API 现状与限制：`docs/api-notes.md`
- 设计/计划：`docs/superpowers/`
