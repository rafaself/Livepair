# apps/api/src/database AGENTS.md

## Scope
Postgres connection foundation, migration scripts, and schema files for backend-owned persistence.

## Guardrails
- Keep this layer infrastructure-only until feature modules need queries; repositories and domain services belong in feature modules, not migration helpers.
- Every schema change must land through `migrations/`; do not hand-edit the live schema outside migrations.
- Prefer explicit constraints and indexes that match the migration design baseline.

## Verification
- Run focused database config tests, then validate local Docker migrate/reset flows.
