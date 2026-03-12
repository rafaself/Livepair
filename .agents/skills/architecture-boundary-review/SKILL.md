---
name: architecture-boundary-review
description: Review whether a change still matches Livepair's real runtime boundaries - renderer vs preload vs main, desktop vs backend, control plane vs realtime hot path, and implemented code vs planned target.
---

# Architecture Boundary Review

## Use when changes touch
- more than one app/package boundary
- renderer/preload/main responsibility placement
- backend modules, controllers, or new endpoints
- shared packages used by both desktop and backend
- features described in docs that may still be target-state only

## Do not use when
- The change is a small local edit with no boundary impact
- The task is purely presentational

## Inspection steps

1. Establish the real baseline from code and docs:
   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `WATCHOUTS.md`
   - changed files under `apps/desktop`, `apps/api`, `packages/shared-*`
2. Separate `implemented today` from `planned target`.
3. Check responsibility placement:
   - renderer: UI and local state only
   - preload: narrow typed bridge only
   - main: privileged desktop integration and IPC handlers
   - backend: control-plane REST endpoints, thin controllers, service-owned logic
   - shared packages: canonical contracts/utilities, not app-specific business logic
4. Check architectural invariants:
   - backend does not proxy realtime media by default
   - controllers stay thin
   - no duplicated contracts across packages
   - no feature work relying on unimplemented subsystems without saying so
5. Flag any place where docs, code, and claimed behavior diverge.

## Output format

```md
## Architecture Boundary Review

**Implemented today:**
- <relevant current boundary>

**Planned target involved:**
- <item or "None">

**Findings:**
- <finding or "None">

**Required moves/fixes:**
- <fix or "None">

**Cannot verify from current context:**
- <item or "None">

**Verdict:** PASS / FAIL
```
