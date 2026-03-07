# apps/api AGENTS.md

## Purpose
NestJS backend. Issues ephemeral tokens, exposes lightweight tools, stores short session checkpoints, receives error reports. Stays out of the audio/video hot path.

## Architecture — Modular Monolith
- One module per domain: `health`, `session`, `tools` (future), `logging` (future).
- Thin controllers — no business logic in controllers.
- Business logic lives in services (`*.service.ts`).
- Do not split into microservices without explicit approval.

## Shared Contracts
- All API payload types come from `@livepair/shared-types`.
- DTOs implement the shared request interface and add validation decorators.
- Never duplicate type definitions here — update `packages/shared-types` and import.

## Config
- All env vars are accessed through `src/config/env.ts`.
- Do not read `process.env` directly in modules; go through the config accessor.
- `ConfigModule.forRoot({ isGlobal: true })` is already wired in `AppModule`.

## Validation
- Use `class-validator` + `class-transformer` via the global `ValidationPipe`.
- DTOs live in `<module>/dto/`.
- Validate all external input at the controller boundary.

## Testing
- TDD for service logic whenever practical.
- Use `@nestjs/testing` and `ts-jest`.
- Health and session behaviors must have tests.
- Use `supertest` for integration-style controller tests when the setup cost is low.

## Change Discipline
- Run `typecheck` and `test` after every change.
- Do not add Redis, session checkpointing, or real Gemini token issuance until the relevant task is scoped.
- Keep the backend small and focused. No premature abstractions.
