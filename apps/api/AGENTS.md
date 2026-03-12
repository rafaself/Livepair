# apps/api AGENTS.md

## Purpose
NestJS backend (control-plane plus backend-mediated text mode). Stays out of the audio/video hot path.

## Structure (Modular Monolith)
- Current domains live in `src/health/`, `src/session/`, `src/config/`.
- Add new domains as their own Nest modules (folder-per-module).
- Keep controllers thin; put business logic in services.

## Shared Contracts
- All API payload types come from `@livepair/shared-types`.
- DTOs implement the shared request interface and add validation decorators.
- Never duplicate API shapes in `apps/api`.

## Config
- All env vars are accessed through `src/config/env.ts`.
- Do not read `process.env` directly in modules; go through the config accessor.
- `ConfigModule.forRoot({ isGlobal: true })` is already wired in `AppModule`.

## Validation
- Use `class-validator` + `class-transformer` via the global `ValidationPipe`.
- DTOs live in `<module>/dto/`.
- Validate all external input at the controller boundary.

## Testing
- Prefer TDD for service logic when practical.
- Use `@nestjs/testing`/`ts-jest`; use `supertest` for cheap controller integration tests.

## Verification
- Prefer `pnpm verify:api` after changes (lint + typecheck + test).
