# AGENTS.md

## Scope
Repo-wide defaults only. Child `AGENTS.md` files add local deltas for their own subtrees.

## Repo anchors
- Speech mode stays desktop -> Gemini Live; do not add backend audio/video proxying.
- The backend owns control-plane work plus today's text path: `GET /health`, `POST /session/token`, and `POST /session/chat`.
- User-facing modes are `text` and `speech`; runtime code still uses `voice` for the Gemini Live path.
- Cross-package payloads and other shared serializable contracts belong in `packages/shared-types`.

## Guardrails
- Ask before adding a new production dependency.
- Keep Electron privilege behind preload + typed bridges; do not weaken existing desktop security defaults.
- Do not duplicate API/IPC/event schemas; update shared contracts and all consumers in the same task.
- Validate external input at HTTP, IPC, and filesystem boundaries.
- If an environment variable changes, update the relevant app-local `.env.example` in the same task.
- Prefer small, targeted changes; use TDD when the logic warrants it.

## Verification
- Start with the smallest relevant checks.
- Repo-wide: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- Package-level: `pnpm verify:<pkg>`

## Local guidance
- Add local `AGENTS.md` files only at real module boundaries with distinct rules.
- Check for nearby child guides under `apps/`, `packages/`, and `infra/` before changing a subtree.
