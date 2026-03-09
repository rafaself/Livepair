---
name: demo-readiness
description: Final presentation gate for Livepair work. Verifies the intended demo path, known failure handling, verification evidence, and what remains unverifiable in the current repository state.
---

# Demo Readiness

## Use when
- A feature or milestone is about to be shown to someone else
- You need a go/no-go answer for a demo or review

## Do not use when
- Implementation is still in progress
- Required review skills still have unresolved fixes

## Workflow

1. Name the exact demo scenario first. This repo should optimize for one main scenario, not a broad tour.
2. Confirm review preconditions:
   - `feature-planner` used when the task was non-trivial
   - relevant post-implementation review skills passed
3. Run or inspect the smallest real verification evidence available:
   - relevant package test command
   - lint/typecheck when appropriate
   - manual flow evidence if no automation exists
4. Check one likely failure mode for the scenario:
   - invalid settings/input
   - backend unavailable
   - token request failure or stub limitation
5. Check presentation quality:
   - no placeholder copy in the demo path
   - no raw stack traces
   - errors and logs are understandable
6. State what is not demo-verifiable from this repository:
   - planned realtime/audio/vision flows without implementation
   - missing end-to-end automation

## Output format

```md
## Demo Readiness

**Scenario:** <main demo path>

**Demo-ready:** YES / NO

**Evidence checked:**
- <command or manual check>

**Blockers:**
- <blocker or "None">

**Known rough edges:**
- <item or "None">

**Cannot verify from current context:**
- <item or "None">

**Minimum fixes before demo:**
- <fix or "None">
```
