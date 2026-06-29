# AI 基建维护

本项目由 Cursor 和 Codex 共同维护。本文档是新增或修改 AI 相关基建时的单一维护入口，包括 rules、skills、commands、permissions，以及 Cursor / Codex 专属配置。

## 设计目标

- `AGENTS.md` 只保存高频必读规则和本文档入口，不复制低频 AI 基建细节。
- 可被 Cursor 和 Codex 共同使用的内容放在共享位置。
- 只被某个工具理解的格式放在该工具自己的目录里。
- 避免在 `.cursor`、`.codex`、`.agents` 中维护同一条规则的多份拷贝。

## 目录边界

```text
AGENTS.md
  共享项目指令入口。只放高频规则、常用命令、项目约定，以及指向本文档的路由。

.agents/
  skills/
    <skill-name>/
      SKILL.md
      scripts/
      references/
      assets/
  guides/
    可选共享资料。只有被 AGENTS.md、skill 或任务显式引用时才读取。

.cursor/
  rules/
    Cursor 专属 Project Rules，使用 .mdc 格式。
  permissions.json
    Cursor 专属 auto-run / approval 配置。
  skills/
    只给 Cursor 使用的 skills。两边共享的 skills 不放这里。

.codex/
  README.md
    Codex 项目层说明。维护 `.codex` 内容前先读这里。
  rules/
    Codex 专属执行策略，使用 .rules 格式。
  config.toml
  config.template.toml（可选）
    Codex 专属配置。机器本地内容优先放模板或忽略文件，不要提交个人密钥、令牌或本机路径。
```

## 共享内容放置规则

通用项目规范、构建命令、测试命令、代码约定、评审要求，优先写入 `AGENTS.md`。

通用可复用 workflow / skill，放入 `.agents/skills/<skill-name>/SKILL.md`。这是 Cursor 和 Codex 都能发现的共享 skill 位置。

复杂说明、低频维护规则、背景资料、决策记录，放入 `docs/`，再从 `AGENTS.md` 或具体 skill 路由过去。

## 工具专属内容放置规则

Cursor 专属 rule 放 `.cursor/rules/*.mdc`。这些 rule 适合表达 Cursor 的 `alwaysApply`、globs、description、手动触发等机制。

Cursor 专属权限配置放 `.cursor/permissions.json`。

Codex 专属执行策略放 `.codex/rules/*.rules`。当前项目入口是 `.codex/rules/default.rules`，用于映射 `.cursor/permissions.json` 中的自动运行/审批意图。这些 rule 用于控制命令是否可以在 sandbox 外运行，和 Cursor 的 `.mdc` prompt rules 不是同一种东西。

Codex 专属项目配置放 `.codex/config.toml` 或 `.codex/config.template.toml`。当前项目提交 `.codex/config.toml` 作为安全的项目级配置层入口，不包含模型、账号、provider、通知命令、本机路径等个人设置。如果未来配置包含个人环境差异，提交模板，不提交本机私有配置。

不要把 Cursor 的 `.mdc` rules 当作 Codex rules；不要把 Codex 的 `.rules` 当作 Cursor prompt rules。

## 新增或修改 commands

如果命令是人和 AI 都应该知道的项目命令，先更新 `AGENTS.md` 的常用命令或约定。

如果命令需要 Cursor 自动运行或免审批，再更新 `.cursor/permissions.json`。

如果命令需要 Codex 特定执行许可或禁止策略，再新增或更新 `.codex/rules/*.rules`。

修改 Codex rules 后，如果本机 Codex CLI 可用，用 `codex execpolicy check --pretty --rules .codex/rules/default.rules -- <command>` 验证匹配结果。

如果命令只服务某个 skill，将命令写在对应 `.agents/skills/<skill-name>/SKILL.md`，必要时把脚本放在该 skill 的 `scripts/` 目录。

修改 `@crp/extension` 代码后，仍然必须执行 `pnpm --filter @crp/extension build`，确保 `dist/` 是最新产物。

## 新增或修改 skills

两边都要用的 skill 放 `.agents/skills/<skill-name>/SKILL.md`。

只给 Cursor 用的 skill 才放 `.cursor/skills/<skill-name>/SKILL.md`。

只给个人本机使用、不要随仓库共享的 skill，不要提交进仓库；放到对应工具的用户级目录。

skill 内容应优先写成工具无关流程。必须写工具专属步骤时，明确标注 Cursor / Codex 分支。

skill 的 `description` 要写清楚触发场景和边界，避免在无关任务中被错误调用。

如果 skill 需要脚本、样例、参考资料，放在该 skill 目录内的 `scripts/`、`examples/`、`references/` 中，避免散落到仓库根目录。

## 新增或修改 rules

通用行为规则优先放 `AGENTS.md`；只有内容太长或低频时，放入 `docs/` 并在 `AGENTS.md` 路由。

Cursor 的 `.cursor/rules/*.mdc` 只写 Cursor 需要的规则，不复制 `AGENTS.md` 中已有的通用项目规范。

Codex 的 `.codex/rules/*.rules` 只写命令执行策略，不写普通项目说明。

如果同一事项同时需要提示模型和约束命令执行，应拆成两部分：模型行为写 `AGENTS.md` 或 docs，命令审批写 `.cursor/permissions.json` / `.codex/rules/*.rules`。

## 变更检查清单

新增 AI 基建前，先判断它是共享内容还是工具专属内容。

修改 `AGENTS.md` 时，保持短小；低频说明路由到 docs。

修改 `.cursor` 时，确认内容是否真的只有 Cursor 需要。

修改 `.codex` 时，确认内容是否真的只有 Codex 需要。

新增共享 skill 后，确认路径是 `.agents/skills/<skill-name>/SKILL.md`。

新增命令后，确认是否需要同步更新 `AGENTS.md`、`.cursor/permissions.json`、`.codex/rules/*.rules`。

提交前检查是否出现同一规则在多个文件中重复维护的情况。
