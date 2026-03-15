---
name: create-commit
description: Create clean git commits by logical block/context.
---

Create commits for the current task.

Rules:
- commit by logical block/context, not one large catch-all commit
- do not mix unrelated changes
- do not add any `Co-authored-by` trailer
- if the task is truly tiny, one commit is acceptable

Steps:
1. Inspect changes with `git status --short` and `git diff --stat`.
2. Group files by logical change.
3. Stage and commit each group with a clear message.
4. Finish with a clean working tree.

## Commit Convention

All commits follow the **Conventional Commits** pattern:

```
type(scope): message
```

### Types

| Type | Use when |
|------|----------|
| `feat` | Adding a new feature or capability |
| `fix` | Fixing a bug |
| `chore` | Maintenance, config, dependencies, CI |
| `refactor` | Restructuring code without changing behavior |
| `test` | Adding or updating tests only |
| `docs` | Documentation-only changes |
| `style` | Formatting, whitespace, linting (no logic change) |
| `perf` | Performance improvements |
| `ci` | CI/CD pipeline changes |

### Scopes

| Scope | Covers |
|-------|--------|
| `monorepo` | Root configs, workspace, tooling |
| `shared` | `packages/shared-types` |
| `api` | `apps/api` backend |
| `desktop` | `apps/desktop` Electron app |
| `docs` | Documentation files |

### Examples

```
chore(monorepo): scaffold pnpm workspace with root configs
feat(shared): add shared-types package
```

Return:
- branch name
- commit hashes and messages
- short note on commit grouping
