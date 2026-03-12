# Known Issues Log

Last updated: 2026-03-12

Use this file to record every failed or inconclusive result from the manual QA runbook in [QA_RUNBOOK.md](./QA_RUNBOOK.md).

## Logging Rules

- add one entry per distinct issue
- include the runbook flow ID, for example `QA-05`
- do not overwrite older entries; append a new update section instead
- if the issue is accepted temporarily, record who accepted the risk
- if the issue is fixed, leave the original entry and add a resolution update

## Entry Template

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

## Current Entries

No issues logged yet.
