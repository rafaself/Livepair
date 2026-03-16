# Documentation Guide

This file points to the current human-facing documentation for Livepair and separates it from archived planning/history material.

## Current Docs

- [README.md](../README.md): repo overview, setup, and the top-level source-of-truth index
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md): current architecture, product vocabulary, and runtime responsibilities
- [docs/MILESTONE_MATRIX.md](./MILESTONE_MATRIX.md): milestone-by-milestone implementation status
- [docs/KNOWN_ISSUES.md](./KNOWN_ISSUES.md): current gaps, risks, and planned follow-up areas
- [docs/IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md): forward-looking work from the current stable baseline
- [docs/QA_RUNBOOK.md](./QA_RUNBOOK.md): manual validation flows for the current product
- [docs/FLOW.md](./FLOW.md): index for current Mermaid architecture/flow diagrams
- [docs/VOICE_CHAT_SINGLE_SURFACE_SPEC.md](./VOICE_CHAT_SINGLE_SURFACE_SPEC.md): current speech-chat ownership model and shipped single-surface behavior

## Current Baseline

- User-facing product states are `inactive` and `speech`.
- Runtime transport terminology still uses `voice` for the Gemini Live speech-session path and `text` for typed turns sent over Live.
- There is no backend-mediated `POST /session/chat` path in the current repository; typed input is only sent over an active Live session.
- `speech` mode requests an ephemeral token from `POST /session/token` and then connects directly from the desktop to Gemini Live.
- `currentMode` and `speechLifecycle` remain the product-level sources of truth.
- Screen context runs only during an active speech session and uses the persisted `manual` or `continuous` Share Screen policy.
- Backend checkpoint persistence, backend-backed tools, and backend error reporting remain planned rather than implemented.

## Archived Material

- Historical implementation notes and transient planning documents live under [docs/archive/](./archive/).
- Historical pre-implementation specs remain under [specs/](../specs/); see [specs/README.md](../specs/README.md) for the boundary note.
