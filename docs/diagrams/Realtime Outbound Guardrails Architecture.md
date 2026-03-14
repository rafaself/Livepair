flowchart TD
    A["Producer emits outbound event"] --> B["RealtimeOutboundGateway.submit(event)"]
    B --> C{"Event kind?"}

    C -->|text| T1["High priority\nnon-replaceable"]
    C -->|audio_chunk| A1["Serialized\nbounded backlog"]
    C -->|visual_frame| V1["Replaceable\nlatest-wins"]

    T1 --> D["Apply guardrails"]
    A1 --> D
    V1 --> D

    D --> E{"Breaker active?"}
    E -->|yes| X["Block event\nrecord diagnostics"]
    E -->|no| F{"Allowed by policy?"}

    F -->|no: throttled/dropped| Y["Drop or replace\nrecord diagnostics"]
    F -->|yes| G["Dispatch through guarded single-flight lane"]

    G --> H{"Transport send type"}
    H -->|text| I["activeTransport.sendText(...)"]
    H -->|audio| J["transport.sendAudioChunk(...)"]
    H -->|visual| K["transport.sendVideoFrame(...)"]

    I --> L["Update diagnostics"]
    J --> L
    K --> L

    X --> M["Debug diagnostics surface"]
    Y --> M
    L --> M