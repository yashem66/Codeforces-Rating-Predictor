# AI 基建维护

本项目由 Cursor 和 Codex 共同维护。本文是新增或修改 AI 相关基建时的维护入口，覆盖 rules、skills、
commands、permissions，以及 Cursor / Codex 专属配置。

## 维护原则

- `AGENTS.md` 只放高频必读规则、常用命令、项目约定和本文入口。
- 复杂说明、低频维护规则和决策记录放在 `docs/`。
- 共享规则优先放在 `AGENTS.md` 或 `.agents/skills/`；工具专属格式放在对应工具目录。
- 不要在 `.cursor`、`.codex`、`.agents` 中重复维护同一条规则。

## 当前目录边界

```text
AGENTS.md
  共享项目指令入口：Shell 要求、项目概览、常用命令、核心约定、文档入口。

.agents/
  当前无已提交共享 skill。未来两边都要用的 skill 放在 .agents/skills/<skill-name>/SKILL.md。

.cursor/
  rules/project.mdc
    Cursor 项目级入口，只路由到 AGENTS.md 和本文。
  permissions.json
    Cursor auto-run / approval 意图配置。

.codex/
  README.md
    Codex 项目层说明。维护 .codex 内容前先读该文件。
  config.toml
    已提交的 Codex 项目层安全配置，不应包含个人模型、账号、provider、通知命令或本机私有路径。
  rules/default.rules
    Codex exec-policy 规则，映射 .cursor/permissions.json 的命令执行意图。

.github/workflows/ci.yml
  CI：安装依赖、typecheck、lint、pnpm -r test。PR 中 Markdown/docs-only 变更会被 paths-ignore 跳过，
  仍可通过 workflow_dispatch 手动运行。
```

## 新增或修改 commands

如果命令是人和 AI 都应知道的项目命令，先更新 `AGENTS.md`，必要时同步 `README.md` 或
`docs/development.md`。

如果命令影响 Cursor 自动运行或审批，更新 `.cursor/permissions.json`。

如果命令影响 Codex 执行许可或禁止策略，更新 `.codex/rules/default.rules`。若本机 Codex CLI 可用，可用：

```powershell
codex execpolicy check --pretty --rules .codex/rules/default.rules -- pnpm -r test
```

修改 `@crp/extension` 代码后，仍必须执行：

```bash
pnpm --filter @crp/extension build
```

确保 `dist/` 是最新产物。

## 新增或修改 skills

- 两边都要用的 skill：`.agents/skills/<skill-name>/SKILL.md`
- 只给 Cursor 用的 skill：`.cursor/skills/<skill-name>/SKILL.md`
- 只给个人本机使用、不随仓库共享的 skill：放到对应工具的用户级目录，不提交到仓库

skill 内容应优先写成工具无关流程。必须写工具专属步骤时，明确标注 Cursor / Codex 分支。

## 新增或修改 rules

- 通用行为规则优先放 `AGENTS.md`；太长或低频时放 `docs/` 并从 `AGENTS.md` 路由。
- Cursor `.mdc` rules 只写 Cursor 需要的 prompt/rule 入口，不复制 `AGENTS.md` 的长规则。
- Codex `.rules` 只写命令执行策略，不写普通项目说明。
- 同一事项如果既需要提示模型又需要约束命令执行，应拆成两部分：
  模型行为写 `AGENTS.md`/`docs`，命令审批写 `.cursor/permissions.json` 或 `.codex/rules/*.rules`。

## 变更检查清单

- 是否先判断内容是共享内容还是工具专属内容？
- 修改 `AGENTS.md` 时是否保持短小，并把低频说明路由到 docs？
- 修改 `.cursor` 时是否确认内容真的是 Cursor 专属？
- 修改 `.codex` 时是否确认内容真的是 Codex 专属？
- 新增共享 skill 后，路径是否为 `.agents/skills/<skill-name>/SKILL.md`？
- 新增命令后，是否需要同步 `AGENTS.md`、`.cursor/permissions.json`、`.codex/rules/default.rules`？
- 是否避免同一规则在多个文件中重复维护？
