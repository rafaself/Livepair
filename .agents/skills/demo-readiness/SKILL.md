---
name: demo-readiness
description: Verifies whether a feature is actually ready to demonstrate. Checks happy path, failure handling, log quality, demo scenario fit, and surface polish. Produces a clear go/no-go verdict with blockers and minimum fixes.
---

# Demo Readiness

## Use when
- A feature is considered "done" and about to be shown
- Preparing for a scheduled demo or review
- Validating that a milestone is presentable

## Sequencing
- **Phase:** final gate — runs last, after all implementation and review skills have completed.
- Before running this skill, confirm that all applicable review skills (`electron-security-review`, `live-api-realtime-review`, `contract-change-check`) have passed. If any have outstanding required fixes, resolve those first.

## Do not use when
- The feature is still actively being implemented
- The task is a spike or internal-only tooling change

## Checklist

1. **Happy path works** - Run the main demo scenario end-to-end. It completes without errors or manual workarounds.
2. **Important failure path handled** - At least one likely failure (network drop, token expiry, invalid input) is handled gracefully. No silent failures or raw stack traces shown to the user.
3. **Logs and errors are useful** - Visible errors have clear messages. Console/log output during demo is clean (no excessive noise, no leaked secrets).
4. **Supports the main demo scenario** - The feature fits the chosen demo flow (per WATCHOUTS.md: one main scenario, others secondary). It does not require explaining away broken adjacent features.
5. **Polished enough to present** - UI elements are aligned, labeled, and responsive. No placeholder text, broken layouts, or jarring transitions visible during the demo path.
6. **Rough edges called out** - Known limitations are documented. The presenter knows what to avoid during the demo.

## Output format

```
## Demo Readiness

**Demo-ready:** YES / NO

**Blockers:**
- <blocker or "None">

**Polish gaps:**
- <gap or "None">

**Minimum fixes before demo:**
- <fix or "None — ready to present">
```
