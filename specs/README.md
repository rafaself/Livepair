# Specs — Historical Pre-Implementation Planning

> **Status: Historical planning material. Not the source of truth for the current system.**

The files in this directory are pre-implementation planning specs. Each one was written before the corresponding code existed. They document what was intended to be built, not the current system state.

Releases 0–5 are fully implemented. The specs for those releases reflect the planning intent at the time of writing, not the current codebase. Do not treat them as authoritative for current behavior, interfaces, or decisions.

## Source of Truth for Current State

| Document | Purpose |
| --- | --- |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | Current architecture and product-mode model |
| [docs/MILESTONE_MATRIX.md](../docs/MILESTONE_MATRIX.md) | Milestone-by-milestone implementation status |
| [docs/IMPLEMENTATION_ROADMAP.md](../docs/IMPLEMENTATION_ROADMAP.md) | Forward-looking roadmap from the current stable baseline |
| [docs/KNOWN_ISSUES.md](../docs/KNOWN_ISSUES.md) | Current gaps, risks, and QA issue log |
| [docs/AUDIT.md](../docs/AUDIT.md) | Status audit and canonical doc map |
| [README.md](../README.md) | Repo overview and source-of-truth index |

## Files in This Directory

| File | Milestone | Status |
| --- | --- | --- |
| [release-0-runtime-infrastructure.md](./release-0-runtime-infrastructure.md) | Release 0: Runtime Infrastructure | Implemented |
| [release-1-real-token-issuance.md](./release-1-real-token-issuance.md) | Release 1: Real Token Issuance | Implemented |
| [release-2-desktop-realtime-session-skeleton.md](./release-2-desktop-realtime-session-skeleton.md) | Release 2: Desktop Realtime Session Skeleton | Implemented |
| [release-3-text-first-realtime-turn.md](./release-3-text-first-realtime-turn.md) | Release 3: Text-First Realtime Turn | Implemented |

Specs for Release 4 onward were not written as standalone spec files. See [docs/IMPLEMENTATION_ROADMAP.md](../docs/IMPLEMENTATION_ROADMAP.md) for remaining planned work.
