# Audio Flow

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
