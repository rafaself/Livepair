# <img src="apps/desktop/src/renderer/components/primitives/livepair-icon.svg" width="32" height="32" alt="Livepair" /> Livepair
## Realtime Multimodal Desktop Assistant

A real-time multimodal desktop assistant.

This repository currently ships two distinct product paths:

* `text` mode: backend-mediated streaming chat via `POST /session/chat` using Gemini text models
* `speech` mode: direct desktop-to-Gemini Live sessions, with the backend issuing ephemeral tokens via `POST /session/token`

The backend stays out of the audio/video hot path, but it is not "token only" anymore: today it serves health, text chat streaming, and Gemini Live token issuance. Backend checkpointing, backend-backed tools, and error-report endpoints are still planned.

## Current Status

### Implemented

* Electron overlay shell with React renderer
* Typed preload bridge and IPC surface
* Text mode backed by backend streaming (`POST /session/chat`) using Gemini text models
* Voice mode backed by Gemini Live API via an SDK-backed transport
* Backend health (`GET /health`) and real Gemini Live ephemeral token issuance (`POST /session/token`)
* Local microphone capture pipeline and assistant audio playback
* Interruption / barge-in behavior (local detection + playback stop)
* Speech transcription event handling and transcript state wiring
* Manual screen-context capture (explicit start/stop) and frame upload via transport
* Session resumption + durability state (resume handles, token refresh, explicit failure paths)
* Mode and lifecycle exclusivity locks (S1 complete, S4 complete)
* Product state sources of truth: `currentMode` (mode) and `speechLifecycle` (speech-state)
* Desktop settings persistence and overlay interaction behavior
* Unit and component tests across shared packages, API, and desktop

### Partially implemented / in progress

* Screen context is live in speech mode, but only through manual start/stop capture; adaptive capture policy and tuning are not implemented yet
* Operational hardening exists for token refresh, resumption, and explicit degraded-state handling, but backend error reporting and broader diagnostics are not implemented yet
* Voice-mode tool handling exists only for narrow local inspection tools (`get_current_mode`, `get_voice_session_status`); backend-backed tool endpoints are still absent

### Planned / not implemented yet

* Session checkpoint persistence + restore (backend + shared contracts)
* Backend-backed tool endpoints such as `POST /tool/screenshot-hd` and `POST /tool/visual-summary`
* `POST /session/error` or equivalent backend error-reporting path
* Adaptive screen-context policy, guardrails, and any HD screenshot flow beyond the current manual frame upload path

## 📚 Source Of Truth Docs

* [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the current architecture and product-mode model
* [docs/MILESTONE_MATRIX.md](./docs/MILESTONE_MATRIX.md) for milestone-by-milestone implementation status
* [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md) for current gaps and risks
* [docs/AUDIT.md](./docs/AUDIT.md) for the status audit and canonical doc map

> **Note on `specs/`:** The `specs/` directory contains historical pre-implementation planning specs (Releases 0–3). They are not the source of truth for the current system. See [specs/README.md](./specs/README.md) for the boundary note and a pointer table.

## 🎯 Goals

* Natural voice interaction with interruption support
* Full-screen awareness with lightweight adaptive capture
* Low-latency realtime responses
* Secure client-to-server auth using ephemeral tokens
* Simple MVP architecture with room for a future "Thinking mode"

## 🧱 Core Stack

### 🖥️ Desktop

* Electron
* React
* TypeScript

### ⚙️ Backend

* NestJS
* TypeScript

### ☁️ Cloud

* Google Cloud Run

### 🤖 AI

* Gemini Developer API
* Gemini Live API

## 🏗️ Architecture

### ⚡ Realtime hot path

Speech mode: Desktop client → Gemini Live API

### 🛠️ Backend responsibilities

Implemented today:
* Issue ephemeral tokens
* Stream backend-mediated text chat
* Expose backend health

Planned:
* Expose backend-backed tools
* Store short session checkpoints
* Receive error reports and logs

### 🚫 Non-goals for MVP

* No backend proxy for audio/video streaming
* No Vertex AI in the realtime path
* No ADK in the MVP path
* No multi-agent orchestration
* No long-term memory system

## 🧭 Key Product Principles

* Low latency is a first-class requirement
* Voice interruption must feel immediate
* Screen capture must stay lightweight and adaptive
* Security defaults must remain strict
* Prefer TDD whenever practical
* Keep the MVP narrow and demo-focused

## 🔄 High-Level Flow

### Product mode model

User-facing product modes:

* `text`: typed chat over the backend text endpoint
* `speech`: direct Gemini Live session with local audio, interruption, and optional manual screen frames

Internal runtime terminology:

* `voice` is the transport/session term used for the Gemini Live speech-mode path
* `currentMode` remains the product-level source of truth for `text` vs `speech`
* `speechLifecycle` remains the product-level speech-state source of truth once speech mode is active

Text mode (backend-mediated):
1. The desktop app starts a streaming chat request to the backend (`POST /session/chat`).
2. The backend streams NDJSON events from a Gemini text model back to the desktop.

Speech mode (direct realtime):
1. The desktop app requests an ephemeral token from the backend (`POST /session/token`).
2. The backend returns a short-lived token for Gemini Live usage.
3. The desktop client opens a realtime session directly with Gemini Live API (SDK transport).
4. The client streams microphone audio and, when explicitly started, manual screen frames.
5. The model returns response audio plus transcript/text events; local interruption stops playback promptly.
6. Typed input can still be sent while speech mode is active, but it travels over the active Live session rather than the backend text endpoint.

## 📁 Repository Layout

```text
.
├── AGENTS.md
├── apps
│   ├── api
│   │   └── ...
│   └── desktop
│       └── ...
├── packages
│   ├── shared-types
│   └── shared-utils
└── .agents
    └── skills
```

## 🖥️ Desktop App Responsibilities

* Capture microphone input
* Manage `text` mode and `speech` mode state
* Capture screen context only when explicitly started during an active speech session
* Run local VAD for interruption detection
* Play model audio output
* Render transcript and session state
* Resume eligible Gemini Live speech sessions using stored resumption handles
* Execute narrow local voice tools when Gemini requests them
* Connect directly to Gemini Live API

## 🔌 Backend Responsibilities

Implemented:
* `GET /health`
* `POST /session/token` (Gemini Live ephemeral token issuance)
* `POST /session/chat` (backend-mediated text chat stream)

Planned:
* `POST /session/checkpoint`
* `POST /tool/screenshot-hd`
* `POST /tool/visual-summary`
* `POST /session/error`

The backend should remain small, modular, and focused.

## 🧠 Session Strategy

The user experience should feel like one continuous session.

Current implementation:

* the desktop runtime keeps conversation state, runtime diagnostics, token-expiry metadata, and Gemini Live resumption handles in local process state
* speech-mode resumption refreshes the token when needed and falls back explicitly to safe `text`/`off` states on failure

Planned extension:

* backend checkpoint persistence for minimal session state
* short recent turns, compressed summary, current goal, and last relevant visual context stored outside the desktop process

Product state rules:
* `currentMode` is the product-level mode source of truth
* `speechLifecycle` is the product-level speech-state source of truth

## 🖼️ Screen Capture Strategy

Current implementation:

* screen capture is manual-only
* screen capture requires an active speech session
* uploaded frames use an explicit conservative policy: 1 FPS capture, compressed JPEG, reduced width, and latest-frame-wins backpressure while a prior upload is in flight
* Live voice sessions use `MEDIA_RESOLUTION_LOW` by default for screen sharing unless explicitly overridden
* if reconnect/resume falls through to a replacement Live runtime, screen capture is stopped and must be manually re-enabled on the new runtime

Planned follow-up:

* adaptive capture boosts when screen changes merit it
* tighter guardrails and tuning
* HD screenshots only if a dedicated backend-backed tool is implemented

## 🔐 Security Rules

* Never embed a permanent API key in the desktop client
* Use ephemeral tokens for realtime sessions
* Keep Electron security strict:

  * `contextIsolation: true`
  * `nodeIntegration: false`
  * privileged APIs only through `preload`

## 📝 Commit Convention

All commits follow the **Conventional Commits** pattern:

```
type(scope): message
```

### Types

| Type | Use when |
|------|----------|
| `feat` | Adding a new feature or capability |
| `fix` | Fixing a bug |
| `chore` | Maintenance, config, dependencies, CI |
| `refactor` | Restructuring code without changing behavior |
| `test` | Adding or updating tests only |
| `docs` | Documentation-only changes |
| `style` | Formatting, whitespace, linting (no logic change) |
| `perf` | Performance improvements |
| `ci` | CI/CD pipeline changes |

### Scopes

| Scope | Covers |
|-------|--------|
| `monorepo` | Root configs, workspace, tooling |
| `shared` | `packages/shared-types`, `packages/shared-utils` |
| `api` | `apps/api` backend |
| `desktop` | `apps/desktop` Electron app |
| `docs` | Documentation files |

### Examples

```
chore(monorepo): scaffold pnpm workspace with root configs
feat(shared): add shared-types and shared-utils packages
feat(api): add NestJS backend with health and session modules
feat(desktop): add Electron app with React renderer and IPC bridge
fix(api): correct token expiry calculation
test(api): add integration tests for session controller
refactor(desktop): extract IPC handlers to separate module
docs(docs): update README with commit conventions
```

### Rules

* Use imperative mood in the message ("add", not "added" or "adds")
* Keep the subject line under 72 characters
* Use the body for details when the subject alone is not enough
* Group related changes into a single commit by logical scope
* Do not mix unrelated changes in the same commit

## 🧪 Development Principles

* Prefer TDD whenever practical and cost-effective
* Keep changes small and reviewable
* Update shared contracts in the same task
* Avoid speculative abstractions
* Protect low-latency behavior from regressions

## 🧰 Local Development

### ✅ Prerequisites

* Node.js
* pnpm
* Linux desktop environment with screen capture support

### 📦 Install

```bash
pnpm install
```

### ▶️ Run the desktop app

Preferred:

```bash
pnpm dev
```

Desktop only:

```bash
pnpm --filter @livepair/desktop dev
```

### ▶️ Run the backend

Preferred:

```bash
pnpm --filter @livepair/api dev
```

### 🧹 Run workspace checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Smallest relevant package-level checks:

```bash
pnpm verify:api
pnpm verify:desktop
pnpm verify:shared-types
pnpm verify:shared-utils
```

## Manual QA

- manual runbook: [docs/QA_RUNBOOK.md](./docs/QA_RUNBOOK.md)
- findings log: [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)

## 🌍 Environment Variables

Environment examples are separated per app:

- backend: [apps/api/.env.example](./apps/api/.env.example)
- desktop: [apps/desktop/.env.example](./apps/desktop/.env.example)

Tool-provided variables such as `NODE_ENV`, `DEV`, and `MODE` are not listed in these files because they come from Node, Electron, or Vite rather than repository configuration.

### ⚙️ Backend: `apps/api/.env.example`

```bash
PORT=
HOST=
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=
EPHEMERAL_TOKEN_TTL_SECONDS=
REDIS_URL=
DISABLE_HTTP_LISTEN=
```

Meaning:

- `PORT`: backend HTTP port. Defaults to `3000` when unset.
- `HOST`: backend bind host. Defaults to `127.0.0.1` when unset.
- `GEMINI_API_KEY`: server-side Gemini credential used for both `/session/token` and `/session/chat`. Never expose this in the desktop app.
- `GEMINI_TEXT_MODEL`: backend text-model override for `text` mode. Defaults to `gemini-2.5-flash` and must not point at a Gemini Live or native-audio model.
- `EPHEMERAL_TOKEN_TTL_SECONDS`: token lifetime returned by `/session/token`. Defaults to `60` when unset.
- `REDIS_URL`: planned Redis connection string for future checkpoint/session storage work. It is not active in the current MVP path yet.
- `DISABLE_HTTP_LISTEN`: when `true`, starts the backend process without binding the HTTP server. Useful for tests or environments where you want bootstrap without opening a port.

### 🖥️ Desktop: `apps/desktop/.env.example`

```bash
OPEN_DEVTOOLS=
VITE_LIVE_MODEL=
VITE_LIVE_API_VERSION=
VITE_LIVE_VOICE_RESPONSE_MODALITY=
VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION=
VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION=
VITE_LIVE_MEDIA_RESOLUTION=
VITE_LIVE_SESSION_RESUMPTION=
VITE_LIVE_CONTEXT_COMPRESSION=
```

Meaning:

- `OPEN_DEVTOOLS`: when `true`, Electron opens devtools automatically in desktop development mode. This is only a local developer convenience flag.
- `VITE_LIVE_MODEL`: overrides the Gemini Live model resource used by speech mode. Defaults to `models/gemini-2.0-flash-exp`.
- `VITE_LIVE_API_VERSION`: selects the Gemini Live API version used to derive the websocket endpoint. Supported values are `v1alpha` and `v1beta`; current ephemeral-token speech sessions require `v1alpha`.
- `VITE_LIVE_VOICE_RESPONSE_MODALITY`: configures the response modality for speech-mode Live sessions. Supported value is `AUDIO`.
- `VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION`: enables input-audio transcription for voice sessions. Supported values are `true` and `false`; default is `false`.
- `VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION`: enables output-audio transcription for voice sessions. Supported values are `true` and `false`; default is `false`.
- `VITE_LIVE_MEDIA_RESOLUTION`: selects the Gemini media resolution enum used for speech-mode frame uploads. Supported values are `MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_MEDIUM`, and `MEDIA_RESOLUTION_HIGH`; default is `MEDIA_RESOLUTION_LOW`.
- `VITE_LIVE_SESSION_RESUMPTION`: enables Gemini Live session resumption for voice sessions. Supported values are `true` and `false`; default is `true`.
- `VITE_LIVE_CONTEXT_COMPRESSION`: enables Gemini Live context window compression setup for speech mode. Supported values are `true` and `false`; default is `true`.

The desktop app must not contain a permanent Gemini API key.

## ✅ Testing

Before closing a task:

* run lint
* run typecheck
* run the smallest relevant test set
* add or update tests for behavior changes
* verify the main flow end to end when feasible

## 🎬 Demo Focus

This MVP is optimized for one strong demo scenario, not for breadth.

Recommended focus:

* realtime voice interaction
* full-screen awareness
* interruption support
* step-by-step guidance
* stable and polished happy path

## 🛣️ Roadmap

Current baseline:

* backend-mediated `text` mode
* direct-to-Gemini-Live `speech` mode
* local interruption handling
* manual screen-context upload during speech mode
* token refresh and Live session resumption

Remaining roadmap focus:

* checkpoint persistence and restore
* backend-backed tools
* backend error reporting
* adaptive screen-context policy and demo hardening
* eventual Thinking mode after the MVP path is stable

## 📌 Status

This repository is currently structured for MVP delivery.
Architecture choices are intentionally biased toward:

* correctness
* security
* low latency
* simplicity
* demo readiness
