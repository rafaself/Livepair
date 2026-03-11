# AGENTS.md

## Scope
This file applies repository-wide. Subdirectories may add *only local deltas* via their own `AGENTS.md`.

## Project Snapshot
Livepair is an Electron + React desktop assistant with a small NestJS backend.

- **Realtime hot path:** desktop connects directly to Gemini Live (no backend proxy for audio/video).
- **Backend role:** control-plane only (health, settings, ephemeral token issuance — currently stubbed — and small MVP support endpoints).
- **Shared contracts:** centralized in `packages/shared-types`.

## Non-Negotiables
- Ask for confirmation before adding new **production** dependencies (changes to any `package.json` `dependencies`).
- Do not weaken Electron security. Keep privileged access behind preload + typed bridges (see `apps/desktop/AGENTS.md`).
- Do not duplicate API/IPC/event schemas across packages; update `packages/shared-types` and all callers in the same task.
- Validate external input at boundaries (HTTP, IPC, filesystem).

## Working Style
- Prefer small, targeted changes; avoid unrelated refactors.
- Prefer TDD when it is practical and cost-effective (especially for logic-heavy code).
- If adding/removing an environment variable, update the relevant app-local `.env.example` in the same task.

## Validation Before Done
- Run the smallest relevant verification set:
  - repo-wide: `pnpm lint`, `pnpm typecheck`, `pnpm test`
  - focused: `pnpm verify:<pkg>` (see root `package.json` scripts)

## Agent Skills
Reusable workflows live in `.agents/skills/<name>/SKILL.md`.
