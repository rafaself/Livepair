# Known Issues

**Last updated:** 2026-03-12

## Current Gaps

- Session checkpoint persistence is not implemented yet. Current resilience work covers Gemini Live session resumption and token refresh, not backend checkpoint save/restore.
- Backend-backed tool endpoints are not implemented yet. Current voice-tool support is limited to local inspection tools (`get_current_mode`, `get_voice_session_status`).
- Screen context is manual-only and speech-session-only. Adaptive local quality promotion now exists for detail-sensitive snapshots, but HD screenshot tooling and broader tuning are still planned work.
- Backend error reporting is not implemented yet. Current diagnostics live in runtime state, tests, and console/log paths rather than a dedicated server endpoint.
- Speech mode currently depends on the Gemini Live ephemeral-token path and the current documented `v1alpha` requirement for that flow.

## Documentation Watchouts For Future Work

- Do not collapse `text` mode and `speech` mode into one vague "chat" path in docs. They currently use different transports, different model paths, and different backend involvement.
- Do not describe backend checkpointing, backend tool execution, or backend error reporting as implemented until the corresponding endpoints and shared contracts actually exist.
- Do not describe screen capture as automatic. The implemented behavior is still explicit manual start/stop during an active speech session, even though adaptive local quality promotion now exists for detail-sensitive snapshots.
- Do not treat runtime `voice` terminology as the user-facing product-mode name. User-facing mode is `speech`; `voice` is an internal session/transport label.

---

## QA Issues Log

Use this section to record every failed or inconclusive result from the manual QA runbook in [QA_RUNBOOK.md](./QA_RUNBOOK.md).

### Logging Rules

- add one entry per distinct issue
- include the runbook flow ID, for example `QA-05`
- do not overwrite older entries; append a new update section instead
- if the issue is accepted temporarily, record who accepted the risk
- if the issue is fixed, leave the original entry and add a resolution update

### Entry Template

```md
## <short issue title>

- Status: Open | Accepted risk | Fixed
- Flow ID: QA-__
- First seen: YYYY-MM-DD
- Commit:
- Tester:
- Owner:
- Environment:
- Severity: blocker | major | minor
- Related issue/PR:

### Repro steps

1.
2.
3.

### Expected

-

### Actual

-

### Evidence

- screenshot:
- recording:
- logs:
- developer-tools snapshot:

### Updates

- YYYY-MM-DD:
```

### Current Entries

No issues logged yet.
