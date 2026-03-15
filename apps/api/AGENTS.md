# apps/api AGENTS.md

## Scope
NestJS backend package for control-plane APIs and backend-mediated text mode.

## Owns
- HTTP controllers, services, modules, and DTOs under `src/`
- Server-side Gemini integrations, config access, and API observability

## Guardrails
- Keep the backend out of the realtime audio/video path.
- Keep controllers thin; move business logic into services.
- Reuse `@livepair/shared-types` for cross-package request/response shapes instead of forking contracts locally.
- Put validated DTOs in `<domain>/dto/`, rely on the global `ValidationPipe`, and read env through `src/config/env.ts`.

## Look here first
- `src/session/`
- `src/health/`
- `src/observability/`
- `src/config/env.ts`

## Verification
- `pnpm verify:api`
