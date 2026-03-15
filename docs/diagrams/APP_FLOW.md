```mermaid
flowchart LR
UI[Electron UI] --> SESSION[Session Controller]
SESSION --> INACTIVE[inactive history]
SESSION --> SPEECH[speech mode]

INACTIVE --> ACTION[Start / Resume Live]
ACTION --> BACKEND[NestJS Backend]
BACKEND --> TOKEN[POST /session/token]
BACKEND --> HEALTH[GET /health]

SPEECH --> TRANSPORT[Gemini Live Transport]
TRANSPORT --> GEMINI[Gemini Live API]
SPEECH --> TYPED[Typed notes over active Live session]
SPEECH --> AUDIO[Audio Pipeline]
SPEECH --> VISION[Manual Screen Capture]
SPEECH --> TOOLS[Local Voice Tools]
TYPED --> TRANSPORT
BACKEND -. planned .-> CHECKPOINT[Checkpoint]
BACKEND -. planned .-> ERROR[Error Reporting]
BACKEND -. planned .-> REMOTETOOLS[Backend Tool Endpoints]
```
