# Architecture Diagrams

This file contains the Mermaid diagram source for the main architecture and the core runtime flows of the project.

---

## 1. Main Architecture

```mermaid
flowchart TB
    U[User]

    subgraph C[Desktop Client - Electron + React + TypeScript]
        UI[UI Layer<br/>Overlay / Panel / Settings]

        subgraph ORCH[Session Controller / Orchestrator]
            SC[Session Lifecycle<br/>connect / reconnect / interrupt / checkpoint]
        end

        subgraph MEDIA[Media Layer]
            AP[Audio Pipeline<br/>mic capture / VAD / PCM chunks / playback queue]
            VP[Vision Pipeline<br/>desktopCapturer / resize / JPEG / adaptive FPS]
        end

        subgraph CORE[Agent Core]
            AC[Conversation State]
            TM[Tool Manager]
        end

        subgraph ADAPTER[Transport Layer]
            LLM[LLM Transport Interface]
            GLA[Gemini Live Adapter]
        end
    end

    subgraph B[Backend API - NestJS on Cloud Run]
        AUTH[Session / Token Module<br/>ephemeral token issuance]
        TOOLS[Tools Module<br/>screenshot-hd / visual-summary]
        LOG[Logging / Error Module]
        SVC[Session Checkpoint API]
    end

    subgraph R[Redis Session Store]
        RS[session_id<br/>goal<br/>summary<br/>recent_turns<br/>last_visual_context]
    end

    subgraph G[Gemini Live API]
        WS[Realtime WebSocket Session]
        MODEL[Multimodal Streaming Model<br/>audio in / screen frames in / audio out / text out / tool requests]
    end

    U --> UI
    UI --> SC

    SC --> AP
    SC --> VP
    SC --> AC
    SC --> TM
    SC --> LLM
    LLM --> GLA

    GLA -->|WebSocket| WS
    WS --> MODEL
    MODEL --> WS
    WS --> GLA

    AP --> GLA
    VP --> GLA

    SC -->|POST /session/token| AUTH
    AUTH -->|ephemeral token| SC

    TM -->|tool request| TOOLS
    TOOLS -->|tool result| TM

    SC -->|POST /session/checkpoint| SVC
    SVC --> R

    SC -->|POST /session/error| LOG
```

---

## 2. Session Initialization Flow

```mermaid
sequenceDiagram
    participant Client as Electron Client
    participant Backend as NestJS Backend
    participant Gemini as Gemini Live API

    Client->>Backend: POST /session/token
    Backend-->>Client: ephemeral token
    Client->>Gemini: Open Live WebSocket
    Client->>Gemini: setup/config message
    Gemini-->>Client: session ready
```

---

## 3. Audio Flow

```mermaid
flowchart LR
    MIC[Microphone] --> CAP[Capture]
    CAP --> VAD[VAD / activity detection]
    VAD --> PCM[PCM audio chunks]
    PCM --> LIVE[Gemini Live Adapter]
    LIVE --> API[Gemini Live API]
    API --> OUT[Response audio 24kHz]
    OUT --> PLAY[Playback queue]
    PLAY --> USER[User hears response]

    USER2[User speaks during response] --> VAD2[VAD detects speech]
    VAD2 --> INT[interrupt()]
    INT --> PLAYSTOP[stop playback / clear queue]
```

---

## 4. Vision Flow

```mermaid
flowchart LR
    DC[desktopCapturer] --> FC[Frame capture]
    FC --> RSZ[Resize 720p-900p]
    RSZ --> JPG[JPEG compression]
    JPG --> FPS[0.5-1 FPS baseline]
    FPS --> LIVE[Gemini Live Adapter]
    LIVE --> API[Gemini Live API]

    CHG[Screen change detected] --> BOOST[Temporary boost 2-3 FPS]
    BOOST --> LIVE
```

---

## 5. Tool Flow

```mermaid
sequenceDiagram
    participant Gemini as Gemini Live API
    participant Client as Electron Client
    participant Backend as NestJS Tools API

    Gemini-->>Client: tool request
    Client->>Backend: POST /tool/screenshot-hd
    Backend-->>Client: tool result
    Client->>Gemini: tool response
```

---

## 6. Session Recovery Flow

```mermaid
sequenceDiagram
    participant Client as Electron Client
    participant Backend as NestJS Backend
    participant Redis as Redis

    Client->>Backend: POST /session/checkpoint
    Backend->>Redis: save session state
    Redis-->>Backend: ok

    Note over Client,Redis: if disconnect/restart

    Client->>Backend: request session recovery
    Backend->>Redis: load session state
    Redis-->>Backend: session snapshot
    Backend-->>Client: goal + summary + recent context
    Client->>Client: rebuild local state
    Client->>Gemini: open new Live session
```

---

## 7. Suggested Usage

Recommended organization in the repository:

* `ARCHITECTURE.md` → narrative architecture document
* `docs/architecture/architecture-diagrams.md` → raw diagram source and flow definitions

You can also embed selected diagrams directly into `ARCHITECTURE.md` and keep this file as the source of truth for Mermaid blocks.
