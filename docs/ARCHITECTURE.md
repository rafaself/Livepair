# Architecture

## 1. System Overview

This project implements a desktop real-time multimodal AI assistant. The application enables natural interaction through voice and screen context using a persistent streaming session with Gemini Live API.

Primary capabilities:

* Real-time voice conversation
* Interruptible responses
* Screen-aware assistance
* Low latency multimodal interaction

The system is composed of a desktop client responsible for real-time media processing and a backend API responsible for control-plane operations such as token issuance, tools, and session persistence.

---

## 2. System Context

Actors and external systems:

* User (desktop interaction)
* Gemini Live API
* Backend API (NestJS)
* Redis session store

High-level interaction:

User → Desktop Client → Gemini Live API
User → Desktop Client → Backend API → Redis

The client communicates directly with Gemini for real-time audio and vision streaming while the backend manages secure operations and persistence.

---

## 3. High-Level Architecture

Major components:

### Desktop Client (Electron + React)

Responsibilities:

* User interface
* Audio capture and playback
* Screen capture pipeline
* Session orchestration
* LLM transport adapter

Internal modules:

* UI Layer
* Audio Pipeline
* Vision Pipeline
* Session Controller
* LLM Transport Adapter
* Tool Bridge

### Backend API (NestJS)

Responsibilities:

* Ephemeral token generation
* Tool execution
* Session checkpoint persistence
* Logging and analytics

### Redis

Responsibilities:

* Session state storage
* Context checkpointing

### Gemini Live API

Responsibilities:

* Multimodal inference
* Streaming conversation
* Tool invocation

---

## 4. Runtime Flows

### Session Initialization

1. Client starts application
2. Client requests ephemeral session token
3. Backend issues token
4. Client opens WebSocket session with Gemini

### Audio Interaction Flow

Microphone capture → VAD detection → PCM chunk generation → Gemini Live API → Response audio → Client playback

Interruption behavior:

User speech detected → Interrupt event → Stop assistant playback → Resume listening

### Vision Flow

Screen capture → Frame resize → JPEG compression → Frame stream → Gemini

Adaptive mode increases frame rate temporarily when screen changes significantly.

### Tool Invocation

Gemini tool request → Client tool bridge → Backend tool endpoint → Result → Gemini

---

## 5. Component Responsibilities

### Session Controller

Coordinates:

* WebSocket lifecycle
* Audio pipeline
* Vision pipeline
* Tool calls
* Session checkpoints

### Audio Pipeline

Handles:

* Microphone capture
* VAD detection
* Audio encoding
* Playback queue

### Vision Pipeline

Handles:

* Desktop capture
* Frame processing
* Adaptive streaming

### LLM Transport Adapter

Abstracts communication with the external AI service.

Responsibilities:

* Session connection
* Streaming input
* Streaming output
* Interrupt handling

This layer isolates the application from model-specific APIs.

---

## 6. Interface Contracts

### Backend Endpoints

POST /session/token
POST /session/checkpoint
POST /tool/screenshot-hd
POST /tool/visual-summary
POST /session/error

### LLM Transport Interface

connect()
disconnect()
sendAudioChunk()
sendFrame()
sendText()
interrupt()

Event handlers:

onAudio()
onText()
onToolCall()
onStateChange()

---

## 7. Session Data Model

Stored in Redis:

session_id
goal
summary
recent_turns
last_visual_context

Used for:

* Session recovery
* Context reconstruction

---

## 8. Architectural Decisions

### Direct Client → LLM Streaming

Reason:

* Minimizes latency
* Avoids media proxying
* Improves real-time interaction

### Backend as Control Plane

Reason:

* Security
* Token management
* Tool execution

### LLM Adapter Layer

Reason:

* Vendor abstraction
* Testability
* Future portability

### Redis Session Store

Reason:

* Fast session state retrieval
* Lightweight persistence

---

## 9. Non-Functional Requirements

Latency target:

Voice interaction response < 1 second

Reliability:

* WebSocket reconnect
* Session checkpointing

Scalability:

* Multiple concurrent sessions

Security:

* Ephemeral tokens
* Backend credential isolation

---

## 10. Deployment Architecture

User Device:

Electron Desktop Client

Cloud:

* NestJS Backend API
* Redis
* Gemini Live API

The client streams media directly to Gemini while backend services manage operational functionality.

---

## 11. Failure and Recovery

Possible failures:

* WebSocket disconnect
* Tool execution failure
* Audio pipeline interruption

Recovery strategies:

* Automatic reconnect
* Session checkpoint restoration
* Error logging

---

## 12. Development Architecture

Repository structure (conceptual):

client/
ui/
audio/
vision/
session/
llm/
tools/

server/
modules/
services/

---

## 13. Future Extensions

Possible improvements:

* Webcam vision support
* Multi-agent collaboration
* Local model fallback
* Extended tool ecosystem
