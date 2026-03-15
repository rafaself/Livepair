# Chat Memory PostgreSQL Migration Asset

## Scope

This document defines the migration context for replacing desktop-local SQLite chat memory with backend-owned PostgreSQL persistence.

Use this together with the repository `AGENTS.md` and any local module `AGENTS.md` files.

## Objective

Replace the current chat-memory persistence architecture with a backend-owned PostgreSQL implementation.

The migration should:

* preserve the current domain behavior that still matters
* discard SQLite and all saved local SQLite data
* avoid unnecessary compatibility layers
* keep the desktop renderer-facing contract as stable as possible
* prefer correctness, simplicity, and clear ownership boundaries

## Decisions Already Made

* PostgreSQL will run in Docker for local development.
* PostgreSQL will be owned by the backend, not by the desktop app.
* SQLite will be removed completely after cutover.
* Existing SQLite data does **not** need to be migrated.
* No dual-write or shadow-mode migration path is required.
* The desktop app should eventually consume chat memory through the backend instead of a local SQLite service.
* The existing renderer-facing bridge/IPC surface should be preserved whenever reasonably possible.

## Current Architecture

Current chat memory lives in the desktop app, under the Electron main process.

Current characteristics:

* storage is SQLite
* persistence is local to the desktop app
* implementation is concentrated in the desktop main chat-memory module
* SQLite-specific behavior exists in the current implementation
* the backend is not yet the source of truth for chat memory

## Target Architecture

Target characteristics:

* PostgreSQL is the persistent store
* the backend owns chat-memory persistence
* the desktop app uses backend APIs for chat-memory operations
* Electron main should no longer be the long-term owner of chat-memory persistence
* renderer-facing behavior should remain as stable as possible

## Migration Principles

* Preserve behavior first, simplify only where legacy SQLite concerns disappear.
* Do not keep compatibility code unless it has real ongoing value.
* Prefer explicit contracts over hidden persistence assumptions.
* Prefer typed backend models and deterministic ordering.
* Prefer transaction-safe writes over convenience shortcuts.
* Keep AGENTS updates short and local.
* Delete legacy code once the new path is stable.

## Working Domain Hypothesis

The migration is expected to center around these main entities, to be confirmed against the current codebase during discovery:

* `chats`
* `messages`
* `live_sessions`
* `chat_summaries`

This is a planning hypothesis, not a hard constraint. The real codebase audit is the source of truth.

## Planned Entity Shape

### 1. chats

Represents the chat container.

Expected fields:

* `id uuid primary key`
* `title text null`
* `created_at timestamptz not null`
* `updated_at timestamptz not null`

Open question:

* whether `is_current` belongs in the database or should remain application/session state

### 2. messages

Represents canonical message history for a chat.

Expected fields:

* `id uuid primary key`
* `chat_id uuid not null references chats(id) on delete cascade`
* `role text not null`
* `content_text text not null`
* `sequence integer not null`
* `created_at timestamptz not null`

Expected rule:

* `unique(chat_id, sequence)`

Important design question:

* sequence allocation must be safe under concurrency

### 3. live_sessions

Represents live sessions associated with a chat.

Expected fields:

* `id uuid primary key`
* `chat_id uuid not null references chats(id) on delete cascade`
* `started_at timestamptz not null`
* `ended_at timestamptz null`
* `status text not null`
* `ended_reason text null`
* `resumption_handle text null`
* `last_resumption_update_at timestamptz null`
* `restorable boolean not null default false`
* `invalidated_at timestamptz null`
* `invalidation_reason text null`
* `summary_snapshot text null`
* `context_state_snapshot jsonb null`

### 4. chat_summaries

Represents durable chat summary state.

Expected fields:

* `chat_id uuid primary key references chats(id) on delete cascade`
* `schema_version integer not null`
* `source text not null`
* `summary_text text not null`
* `covered_through_message_sequence integer not null`
* `updated_at timestamptz not null`

## Preserved Behavioral Expectations

These should be confirmed against the current implementation during discovery and preserved unless there is a strong reason to simplify them.

* chat creation semantics
* chat listing semantics
* stable ordering rules for chats
* stable ordering rules for messages
* deterministic message sequence per chat
* current-chat behavior, if it is still truly domain-relevant
* live-session lifecycle behavior
* live-session update and end semantics
* durable summary behavior
* bridge/IPC behavior exposed to the renderer, unless a change is clearly justified

## Likely SQLite-Specific Behavior To Eliminate

These are expected categories, to be confirmed in the audit:

* `PRAGMA` usage
* WAL-related setup
* SQLite schema introspection paths
* integer-backed booleans
* timestamp strings where proper timestamps should exist
* `better-sqlite3` synchronous transaction assumptions
* SQLite-specific migration or schema-evolution logic

## Postgres Design Guidance

When implementing the new schema, prefer:

* `uuid` for identifiers
* `timestamptz` for timestamps
* `boolean` for flags
* `jsonb` for structured snapshots/state
* explicit constraints and indexes
* transaction-safe write paths
* deterministic ordering in all list operations

## Important Open Questions

These should be resolved through the Wave 1 audit and design work.

### 1. Should `is_current` exist in the database?

It may reflect desktop/UI session state more than durable backend domain state.

### 2. How should message sequence be allocated?

Do not rely on naive `MAX(sequence) + 1` without proper concurrency protection.

Possible safe directions:

* transaction + lock scoped per chat
* per-chat sequence counter
* another deterministic allocation strategy with strong tests

### 3. Is there overlap between live-session summary snapshot and durable chat summaries?

Audit the real semantics before simplifying.

## Recommended API Surface Direction

The backend API should be oriented around domain operations, not raw persistence mechanics.

Expected operation groups:

* create/get/list/open chats
* append/list messages
* create/get/list/update/end live sessions
* get/upsert chat summaries

Prefer:

* stable DTOs
* explicit validation
* clear error semantics
* shared types where appropriate

## Migration Waves

### Wave 1 — Discovery and design

* audit current chat memory implementation
* map models, operations, invariants, ordering, transitions
* identify SQLite-specific assumptions
* produce the migration design baseline

### Wave 2 — Docker Postgres and backend DB foundation

* add local Postgres via Docker
* add backend DB configuration
* add migration tooling
* create initial schema migration scaffold

### Wave 3 — Backend chat-memory module on PostgreSQL

* implement DB module and repositories/services
* implement endpoints
* enforce sequence correctness and transactional safety
* preserve domain behavior

### Wave 4 — Desktop cutover to backend persistence

* replace local SQLite-backed chat memory with backend calls
* preserve renderer-facing bridge/API as much as possible
* remove dependency on local SQLite persistence in production flows

### Wave 5 — SQLite removal and hardening

* remove SQLite implementation and dependencies
* remove dead code and obsolete tests
* update docs and local developer workflow
* validate final backend/Postgres-only setup

## Out of Scope

* migrating legacy SQLite data
* preserving local saved SQLite data
* maintaining a long-lived compatibility layer
* speculative redesign outside the migration goal
* broad UI refactors unrelated to persistence cutover

## Expected Deliverables By End State

* backend-owned PostgreSQL chat memory
* desktop integration through backend APIs
* SQLite removed from production code
* clean local developer workflow using Docker Postgres
* updated architecture/docs/AGENTS where needed

## Guidance For Agents

When executing a wave:

* read this file and the relevant `AGENTS.md` files first
* preserve current behavior unless simplification is clearly justified
* keep changes scoped to the wave
* avoid speculative abstractions
* use TDD whenever implementation is requested
* remove dead code rather than hiding it
* keep documentation concise and operational
