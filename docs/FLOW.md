# Architecture Diagrams

This index points to the Mermaid diagram source files under `docs/diagrams`.

These diagrams are intended to match the current repository state. When a diagram includes planned-only behavior, it should say so explicitly in the title or note block.

## Diagram Files

- [Main Architecture](./diagrams/main-architecture.md)
- [Session Initialization Flow](./diagrams/session-initialization-flow.md)
- [Audio Flow](./diagrams/audio-flow.md)
- [Vision Flow](./diagrams/vision-flow.md)
- [Tool Flow](./diagrams/tool-flow.md)
- [Session Recovery Flow](./diagrams/session-recovery-flow.md)

## Suggested Usage

- `docs/ARCHITECTURE.md` -> narrative architecture document
- `docs/diagrams/*.md` -> raw diagram source and flow definitions

You can also embed selected diagrams directly into `ARCHITECTURE.md` and keep the files in `docs/diagrams` as the source of truth for Mermaid blocks.

Historical planning notes and completed implementation wave notes live under `docs/archive/`.
