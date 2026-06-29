# AGENTS.md

## Shell 执行要求（必读）

本机不支持 Shell 沙盒，所有 Shell 命令必须带 `required_permissions: ["all"]` 执行，否则一律返回
`no exit status`。

不要在 `no exit status` 上排查执行策略、Shell 集成、杀软、重启等——根因就是沙盒不支持，加该参数即可。

环境补充：包管理器用 **pnpm**（已全局安装）；PowerShell 下没有 `tail`/`head`/`grep` 等 Unix 命令，不要在命令里用它们
（工具会自动保存完整输出，无需截断）。

## 项目概览

TypeScript monorepo（pnpm workspaces）。

- `packages/core`：零 I/O 纯算法库，复现 Codeforces rating 计算，可被 Node 和浏览器复用。
- `packages/cli`：Node 数据/验证工具，抓取 CF 数据、构建参赛索引、离线验证算法精度。
- `packages/extension`：Chrome MV3 扩展，在 standings 页面注入 Rating / Pred Δ 列。

核心目标：高精度复现 Codeforces rating 计算，并把同一套算法用于离线验证和浏览器扩展预测。

## 常用命令

- 安装：`pnpm install`
- 全部测试：`pnpm -r test`
- 全部构建：`pnpm -r build`
- 类型检查：`pnpm typecheck`
- Lint：`pnpm lint`
- 单包测试：`pnpm --filter @crp/core test` / `pnpm --filter @crp/cli test` /
  `pnpm --filter @crp/extension test`
- 扩展打包：`pnpm --filter @crp/extension build`
- 样本验证：`pnpm --filter @crp/cli crp validate sample`
- 全量验证：`pnpm --filter @crp/cli crp validate-all`

## 约定

- `@crp/extension` 代码交付后必须执行 `pnpm --filter @crp/extension build` 重新打包，否则 `dist/` 仍是旧产物，
  reload 插件不会生效。
- `@crp/core` 必须保持纯函数、零 I/O（不得引入 `node:`/`fs`/`fetch`），以便浏览器复用。
- rating 计算在“计算分（1400 基准）”空间；显示分↔计算分换算只在调用边界做。离线精确验证由 `@crp/cli`
  负责，扩展直播预测采用浏览器可行的显示分/未评分 1400 策略。
- CF 参考实现用整数截断除法，对应 TS 代码处一律用 `Math.trunc`，否则会出现 ±1 误差。
- TDD：先写失败测试再实现。声明“完成/通过”前必须实际跑过测试。
- 提交用 Conventional Commits（`feat`/`fix`/`docs`/`chore`/`test`）。

## 关键资料

- 项目入口：`README.md`
- 算法说明与出处：`docs/algorithm.md`
- CF API / HTML fallback 现状：`docs/api-notes.md`
- CLI 命令：`docs/cli.md`
- Chrome 扩展：`docs/extension.md`
- 开发与 CI：`docs/development.md`
- 历史设计/计划：`docs/superpowers/`
- AI 基建维护：`docs/ai-maintenance.md`

## AI 基建维护

本项目由 Cursor 和 Codex 共同维护。

凡涉及新增或修改 AI 基建时，必须先阅读 `docs/ai-maintenance.md`，包括但不限于 rules、skills、commands、
permissions、Cursor / Codex 专属配置。
