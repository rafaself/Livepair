# 🚀 Livepair
## Realtime Multimodal Desktop Assistant

A real-time multimodal desktop assistant.

This application captures microphone input and full-screen context, sends the realtime stream to Gemini Live API, and responds with low-latency voice and contextual guidance. The backend stays out of the audio/video hot path and is responsible only for ephemeral token issuance, lightweight tools, session checkpointing, and error reporting.

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

Desktop client → Gemini Live API

### 🛠️ Backend responsibilities

* Issue ephemeral tokens
* Expose lightweight tools
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

1. The desktop app requests an ephemeral token from the backend.
2. The backend returns a short-lived token for Live API usage.
3. The desktop client opens a realtime session directly with Gemini Live API.
4. The client streams:

   * microphone audio
   * compressed screen frames
5. The model returns:

   * response audio
   * text/transcript events
   * realtime guidance
6. The backend is used only when needed for:

   * token refresh
   * HD screenshot tooling
   * visual summary generation
   * session checkpointing
   * error reporting

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
* Capture the full screen
* Run local VAD for interruption detection
* Play model audio output
* Render transcript and session state
* Request HD screenshots when needed
* Connect directly to Gemini Live API

## 🔌 Backend Responsibilities

* `POST /session/token`
* `POST /session/checkpoint`
* `POST /tool/screenshot-hd`
* `POST /tool/visual-summary`
* `POST /session/error`

The backend should remain small, modular, and focused.

## 🧠 Session Strategy

The user experience should feel like one continuous session.

Internally, the app should treat realtime sessions as resumable and lightweight:

* store only minimal session state
* keep short recent turns
* maintain a compressed summary
* preserve the current goal
* keep the last relevant visual context

## 🖼️ Screen Capture Strategy

Default capture should remain lightweight:

* low FPS
* compressed JPEG frames
* reduced resolution

Increase capture rate only when needed:

* relevant screen change
* visual error or diagram detected
* explicit user request
* temporary high-attention moments

Use HD screenshots only on demand.

## 🔐 Security Rules

* Never embed a permanent API key in the desktop client
* Use ephemeral tokens for realtime sessions
* Keep Electron security strict:

  * `contextIsolation: true`
  * `nodeIntegration: false`
  * privileged APIs only through `preload`

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

```bash
pnpm --filter desktop dev
```

### ▶️ Run the backend

```bash
pnpm --filter api dev
```

### 🧹 Run workspace checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Adjust package names and scripts to match the actual workspace setup.

## 🌍 Environment Variables

### ⚙️ Backend

```bash
PORT=
GEMINI_API_KEY=
EPHEMERAL_TOKEN_TTL_SECONDS=
REDIS_URL=
```

### 🖥️ Desktop

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

### 🚀 MVP

* Fast mode
* direct client → Live API
* adaptive screen capture
* token issuance backend
* short session checkpoints

### 🔮 Later

* Thinking mode
* richer tool orchestration
* stronger session recovery
* deeper domain workflows
* possible ADK-backed runtime outside the MVP path

## 📌 Status

This repository is currently structured for MVP delivery.
Architecture choices are intentionally biased toward:

* correctness
* security
* low latency
* simplicity
* demo readiness
