# Wave 1: Chat-Memory PostgreSQL Design Baseline

> Historical note: this document captures the Wave 1 baseline before the desktop cutover and cleanup. Current production no longer ships `apps/desktop/src/main/chatMemory/` or `chat-memory.sqlite`; durable chat memory now lives behind the backend `/chat-memory/*` APIs.

## Historical current state

- Implemented today: desktop main owns chat-memory persistence in `apps/desktop/src/main/chatMemory/` and stores it in `app.getPath('userData')/chat-memory.sqlite`.
- The renderer only sees the typed bridge in `apps/desktop/src/shared/desktopBridge.ts` via preload IPC wrappers.
- The backend does not own chat-memory persistence yet.
- `switchToChat(chatId)` is renderer-local state only. It does **not** mutate the persisted `isCurrent` flag; `isCurrent` instead marks the durable canonical chat container returned by `getOrCreateCurrentChat()` and promoted by `createChat()`.

## Current models and operations

### Models

| Model | Fields | Notes |
| --- | --- | --- |
| `ChatRecord` | `id`, `title`, `createdAt`, `updatedAt`, `isCurrent` | `title` is trimmed to `null`; exactly one persisted current chat exists today. |
| `ChatMessageRecord` | `id`, `chatId`, `role`, `contentText`, `createdAt`, `sequence` | `role` is `user \| assistant`; content is trimmed and must stay non-empty. |
| `LiveSessionRecord` | `id`, `chatId`, `startedAt`, `endedAt`, `status`, `endedReason`, `resumptionHandle`, `lastResumptionUpdateAt`, `restorable`, `invalidatedAt`, `invalidationReason`, `summarySnapshot?`, `contextStateSnapshot?` | Resumption metadata and snapshot metadata are updated independently. |
| `DurableChatSummaryRecord` | `chatId`, `schemaVersion`, `source`, `summaryText`, `coveredThroughSequence`, `updatedAt` | One summary per chat; replaced only when coverage advances. |

### Operations exposed to the renderer today

- Chats: `createChat`, `getChat`, `getOrCreateCurrentChat`, `listChats`
- Messages: `listChatMessages`, `appendChatMessage`, `getChatSummary`
- Live sessions: `createLiveSession`, `listLiveSessions`, `updateLiveSession`, `endLiveSession`

### Current ordering and transitions

- Chats list as `updatedAt DESC, id DESC`.
- Messages list as canonical sequence order; current SQLite query uses `sequence ASC, id ASC`.
- Live sessions list as `startedAt DESC, id DESC`; renderer code treats `liveSessions[0]` as the latest row.
- `createChat()` demotes the previous current chat and promotes the new one in one write path.
- `getOrCreateCurrentChat()` creates a current chat only when none exists.
- `appendChatMessage()` appends a new canonical message, allocates the next per-chat sequence, and touches `chat.updatedAt`.
- `createLiveSession()` always starts `active` with `restorable=false`.
- `updateLiveSession(kind='resumption')` merges resumption fields without clobbering snapshots.
- `updateLiveSession(kind='snapshot')` merges snapshots without clobbering resumption fields.
- `endLiveSession()` clears resumption state, marks the row ended/failed, and then builds a durable summary from canonical messages if summary coverage advances.

## Preserved invariants

These are the migration baseline for the Postgres implementation.

- Preserve the renderer-facing bridge surface and shared record shapes. The desktop can change its backing implementation later, but the renderer should keep calling the same operations.
- Preserve a durable current-chat concept. `getOrCreateCurrentChat()` must always return exactly one durable current chat, and `createChat()` must make the new chat current.
- Preserve the distinction between durable current chat and renderer-selected historical chat. Wave 2 should **not** add a new “set current chat” backend mutation just because the renderer can open old chats.
- Preserve deterministic chat ordering: `updatedAt DESC, id DESC`.
- Preserve deterministic per-chat message sequencing starting at `1`, increasing by `1`, with no duplicate committed sequence per chat.
- Preserve message append rules: existing chat required, trimmed non-empty content, and `chat.updatedAt` moves with the append.
- Preserve live-session ordering: latest-first by `startedAt DESC, id DESC`.
- Preserve end semantics: ending a live session clears `resumptionHandle`, forces `restorable=false`, sets `lastResumptionUpdateAt`, and records invalidation metadata.
- Preserve update merge semantics: resumption updates must not erase snapshots, and snapshot updates must not erase resumption metadata.
- Preserve summary replacement semantics: at most one durable summary per chat, and only replace it when `coveredThroughSequence` increases.
- Preserve the current rehydration inputs: renderer code may prefer a durable chat summary, but it still falls back to the latest live-session snapshot summary/context when summary coverage is stale or absent.

## SQLite-specific behaviors to eliminate

- `better-sqlite3` synchronous write assumptions in desktop main.
- File-local persistence at `chat-memory.sqlite`.
- `PRAGMA` setup (`journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`).
- Stepwise SQLite schema backfills and `PRAGMA table_info(...)` schema introspection.
- SQLite storage encodings: `INTEGER` booleans, `TEXT` timestamps, and JSON snapshots stored as raw text.
- `MAX(sequence) + 1` sequence allocation as the long-term write path.
- Reload-time tolerance for malformed persisted JSON rows. The backend should validate inputs before they reach storage; Postgres `jsonb` should hold only valid context-state snapshots.

## What must stay compatible vs what can simplify

### Must stay behaviorally compatible

- `ChatRecord.isCurrent` stays in the public contract.
- `listChats()`, `listChatMessages()`, and `listLiveSessions()` keep their deterministic order.
- `endLiveSession()` continues to preserve canonical messages and may update durable summary state as a side effect.
- The latest live session remains the first row returned by `listLiveSessions(chatId)`.
- `DurableChatSummaryRecord.coveredThroughSequence` remains the compatibility anchor for summary freshness.

### Can simplify because legacy SQLite data is discarded

- The Postgres schema can start clean; no SQLite data backfill, dual write, or SQLite compatibility layer is needed.
- Backend writes can be made fully transactional even where the current SQLite flow is split across repository calls.
- `contextStateSnapshot` should become `jsonb`, with malformed-row recovery removed from the persistence layer.
- Internal DB columns can be backend-only. For example, per-chat sequence allocation metadata does not need to appear in shared types.

## Proposed Postgres schema

### `chats`

- `id uuid primary key`
- `title text null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- `is_current boolean not null default false`
- `next_message_sequence integer not null default 1 check (next_message_sequence >= 1)`

Constraints and indexes:

- unique partial index for the single current chat: `... WHERE is_current`
- index on `(updated_at desc, id desc)`

Notes:

- Keep `is_current` in the first Postgres cut to preserve existing semantics with minimal behavior risk.
- `next_message_sequence` is internal allocator state, not part of the shared public contract.

### `messages`

- `id uuid primary key`
- `chat_id uuid not null references chats(id) on delete cascade`
- `role text not null check (role in ('user', 'assistant'))`
- `content_text text not null check (btrim(content_text) <> '')`
- `created_at timestamptz not null`
- `sequence integer not null check (sequence > 0)`

Constraints and indexes:

- `unique(chat_id, sequence)`

### `live_sessions`

- `id uuid primary key`
- `chat_id uuid not null references chats(id) on delete cascade`
- `started_at timestamptz not null`
- `ended_at timestamptz null`
- `status text not null check (status in ('active', 'ended', 'failed'))`
- `ended_reason text null`
- `resumption_handle text null`
- `last_resumption_update_at timestamptz null`
- `restorable boolean not null default false`
- `invalidated_at timestamptz null`
- `invalidation_reason text null`
- `summary_snapshot text null`
- `context_state_snapshot jsonb null`

Constraints and indexes:

- check active rows stay open and ended/failed rows carry `ended_at`
- check restorable rows keep `invalidated_at is null`
- index on `(chat_id, started_at desc, id desc)`

### `chat_summaries`

- `chat_id uuid primary key references chats(id) on delete cascade`
- `schema_version integer not null check (schema_version > 0)`
- `source text not null`
- `summary_text text not null check (btrim(summary_text) <> '')`
- `covered_through_message_sequence integer not null check (covered_through_message_sequence > 0)`
- `updated_at timestamptz not null`

## Proposed backend API surface

These are backend endpoints. The desktop main process can later call them while preserving the existing renderer-facing IPC surface.

| Existing desktop operation | Proposed backend route | Notes |
| --- | --- | --- |
| `createChat(req?)` | `POST /chat-memory/chats` | Creates a new chat and makes it current. |
| `getChat(chatId)` | `GET /chat-memory/chats/:chatId` | Returns `404` when missing. |
| `getOrCreateCurrentChat()` | `PUT /chat-memory/chats/current` | Ensures a current chat exists, then returns it. |
| `listChats()` | `GET /chat-memory/chats` | Returns chats in current deterministic order. |
| `listChatMessages(chatId)` | `GET /chat-memory/chats/:chatId/messages` | Canonical history only. |
| `appendChatMessage(req)` | `POST /chat-memory/chats/:chatId/messages` | Allocates the next per-chat sequence transactionally. |
| `getChatSummary(chatId)` | `GET /chat-memory/chats/:chatId/summary` | Summary remains read-only from the renderer’s perspective. |
| `createLiveSession(req)` | `POST /chat-memory/chats/:chatId/live-sessions` | Creates `active` session row. |
| `listLiveSessions(chatId)` | `GET /chat-memory/chats/:chatId/live-sessions` | Latest row first. |
| `updateLiveSession(kind='resumption')` | `PATCH /chat-memory/live-sessions/:id/resumption` | Preserve merge semantics. |
| `updateLiveSession(kind='snapshot')` | `PATCH /chat-memory/live-sessions/:id/snapshot` | Preserve merge semantics. |
| `endLiveSession(req)` | `POST /chat-memory/live-sessions/:id/end` | Ends the session and updates durable summary state in the same transaction. |

Notes:

- Do **not** add a public “upsert summary” renderer API in Wave 2. Current renderer behavior does not need it.
- Keep DTOs in `@livepair/shared-types` only where they cross desktop/backend boundaries.

## Concurrency and transaction notes

### Current chat creation / ensure-current

- `createChat()` and `getOrCreateCurrentChat()` should run in a single DB transaction.
- Keep the unique partial index on `is_current` as the final safety net.
- If concurrent requests race to create or promote the current chat, retry on unique-violation rather than returning multiple current rows.

### Per-chat message sequence

Preferred strategy for Wave 3 implementation:

1. Start a transaction.
2. Lock and update the chat row:
   - `UPDATE chats SET updated_at = $now, next_message_sequence = next_message_sequence + 1 WHERE id = $chatId RETURNING next_message_sequence - 1 AS sequence`
3. Insert the new message row with that returned `sequence`.
4. Commit.

Why this baseline:

- It preserves deterministic per-chat sequence allocation.
- It avoids `MAX(sequence) + 1` races under backend concurrency.
- It rolls back cleanly, so failed appends do not leave committed sequence gaps.

### Live-session end + summary write

- Ending a live session and conditionally upserting `chat_summaries` should happen in one transaction in Postgres.
- The summary builder should read canonical `messages` inside that transaction and only replace the existing summary when coverage advances.

## Open questions / risks

- **Persistence scope:** current SQLite data is per desktop install under `userData`. Backend-owned persistence needs an explicit scope decision before implementation (single local profile vs future user/account scope).
- **Summary duplication:** `live_sessions.summary_snapshot` and `chat_summaries.summary_text` overlap in purpose but have different freshness semantics today. Keep both in the first Postgres cut; simplify only after real usage proves one can disappear.
- **Constraint strictness:** some live-session state-machine rules can be enforced in SQL, but Wave 2 should not over-tighten constraints beyond currently valid states without matching tests.
- **HTTP error semantics:** missing chat/live-session errors, invalid state transitions, and validation failures should be made explicit before desktop cutover so bridge behavior stays predictable.

## Recommended scope for Wave 2

- Add Docker Postgres and backend DB configuration.
- Add backend migration tooling and create the initial schema for `chats`, `messages`, `live_sessions`, and `chat_summaries`.
- Add focused DB tests for:
  - current-chat uniqueness
  - concurrent per-chat sequence allocation
  - live-session resumption/snapshot merge semantics
  - end-live-session summary upsert behavior
- Do not add renderer changes, desktop cutover logic, or SQLite removal in Wave 2.
