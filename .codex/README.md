# Codex project layer

This directory contains Codex-only infrastructure for this repository.

Shared project instructions stay in `AGENTS.md`. Shared workflows and skills should go under `.agents/skills/`. Do not duplicate shared guidance here.

## Files

- `config.toml`: checked-in project config layer for Codex. Keep it free of personal model, provider, authentication, notification, and machine-local settings.
- `rules/default.rules`: Codex exec-policy rules. These mirror the intent of `.cursor/permissions.json`, but use Codex's `.rules` format.

## Maintenance

When adding or changing commands:

1. Update `AGENTS.md` if humans and both agents should know the command.
2. Update `.cursor/permissions.json` if Cursor auto-run behavior changes.
3. Update `.codex/rules/default.rules` if Codex command approval behavior changes.
4. Keep tool-specific formats separate. Cursor `.mdc` rules and Codex `.rules` files are not interchangeable.

If Codex CLI is available, test rule changes with:

```powershell
codex execpolicy check --pretty --rules .codex/rules/default.rules -- pnpm -r test
```
