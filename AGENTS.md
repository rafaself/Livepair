# AGENTS.md

## Scope
This file applies repository-wide. Subdirectories may add *only local deltas* via their own `AGENTS.md`.

## Project Snapshot
Livepair is an Electron + React desktop assistant with a small NestJS backend.

- **Realtime hot path:** speech mode connects directly from the desktop to Gemini Live (no backend proxy for audio/video).
- **Backend role today:** control-plane plus backend-mediated text mode (`GET /health`, `POST /session/token`, `POST /session/chat`).
- **Planned backend work:** checkpoint persistence, backend-backed tool endpoints, and error reporting are not implemented yet.
- **Product model:** user-facing modes are `text` and `speech`; runtime transport terminology still uses `voice` for the Gemini Live session path.
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
