# apps/api/src/chat-memory AGENTS.md

## Scope
Backend-owned durable chat-memory persistence, summary logic, and HTTP routes.

## Guardrails
- Preserve the shared record shapes and Wave 1 ordering/current-chat invariants.
- Allocate message sequences by updating `chats.next_message_sequence` inside a transaction; do not use `MAX(sequence) + 1`.
- Ending a live session and advancing the durable summary must stay in one transaction.

## Verification
- Run the chat-memory unit specs plus the DB-backed repository/HTTP specs with `DATABASE_URL` set.
