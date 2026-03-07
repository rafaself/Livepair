# AGENTS.md

## Purpose
This repository builds a real-time multimodal desktop assistant.

Core stack:
- Desktop: Electron + React + TypeScript
- Backend: NestJS + TypeScript
- Workspace: pnpm
- Cloud: Google Cloud Run
- AI: Gemini Developer API + Gemini Live API
- Realtime auth: ephemeral tokens issued by the backend

## Non-Negotiable Architecture
- Keep the realtime hot path short: desktop client connects directly to Gemini Live API.
- Do not proxy audio/video through the backend unless the task explicitly requires an architecture change.
- The backend is for token issuance, lightweight tools, session checkpointing, and error reporting.
- Do not introduce Vertex AI or ADK into the MVP path unless explicitly requested.
- Preserve the MVP split: Fast mode first, Thinking mode later.

## Development Approach
- Prefer TDD whenever it is practical and cost-effective.
- For bug fixes, reproduce the issue with a test first when feasible.
- For new domain logic, shared contracts, reducers, parsers, and backend services, write the failing test first when practical.
- Do not skip cheap, reliable tests for logic-heavy changes.
- For spikes or throwaway code, TDD is optional, but regression coverage must exist before closing the task.

## Security Invariants
- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false`.
- Expose privileged functionality only through `preload`.
- Renderer code must not access privileged APIs directly.
- Do not weaken Electron security for convenience.
- Never ship permanent API keys in the desktop client.

## Shared Contracts
- Any change to API payloads, IPC contracts, or runtime events must update shared types in the same task.
- Keep contracts centralized and typed.
- Do not duplicate schemas across packages.

## Realtime Rules
- Optimize for low latency.
- Keep audio chunking small.
- Keep screen capture lightweight and adaptive.
- Do not increase capture frequency by default without measuring impact.
- Treat interruption handling as a first-class UX requirement.
- Preserve resumability: reconnection, checkpointing, and short-context recovery matter.

## Backend Rules
- Keep the backend as a modular monolith.
- Avoid premature microservices.
- Prefer simple REST endpoints for MVP support flows.
- Validate external input.
- Keep business logic out of controllers.

## Session Rules
- Do not store raw full conversation history by default.
- Store only the minimum useful session state:
  - current goal
  - short recent turns
  - compressed summary
  - last relevant visual context

## Validation Before Done
- Run lint.
- Run typecheck.
- Run the smallest relevant test set.
- Add or update tests for behavior changes.
- Verify the changed flow end-to-end when feasible.

## Change Discipline
- Prefer small, targeted changes.
- Do not refactor unrelated code in the same task.
- Reuse existing patterns before adding new abstractions.
- Do not add dependencies unless clearly justified.
- Do not expand MVP scope without explicit approval.

## Task Output
For non-trivial changes, provide:
- what changed
- files touched
- risks or tradeoffs
- follow-up work still needed

## Priority Order
1. Correctness
2. Security
3. TDD when practical
4. Low latency
5. Simplicity
6. Extensibility