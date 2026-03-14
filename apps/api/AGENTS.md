# apps/api AGENTS.md

## Purpose
NestJS backend for the control plane and backend-mediated text mode. It stays out of the audio/video hot path.

## What belongs here
- Backend-only controllers, services, DTOs, modules, and integrations under `src/`.
- HTTP validation, config access, and server-side orchestration.

## What must not go here
- Media relay or proxy logic for the Live speech path.
- Duplicated request or response shapes from `@livepair/shared-types`.
- Direct `process.env` reads outside the config layer.

## Local conventions
- Add new domains as modules under `src/<domain>/`.
- Keep controllers thin; put business logic in services.
- DTOs live in `<domain>/dto/`, implement shared request types when applicable, and carry validation decorators.
- Read env through `src/config/env.ts`.
- Validate external input at the controller boundary via the global `ValidationPipe`.

## Verification
- Prefer `pnpm verify:api` after code changes in this package.
