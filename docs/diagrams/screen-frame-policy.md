stateDiagram-v2
    direction LR

    [*] --> ScreenShareOff

    ScreenShareOff --> ScreenShareOn: user enables screen share
    ScreenShareOn --> ScreenShareOff: user disables screen share

    state ScreenShareOn {
        [*] --> Sleep

        Sleep --> Snapshot: explicit visual request\n("analyze screen now",\n"look at this screen")
        Snapshot --> Sleep: snapshot completed\nor no further visual need

        Snapshot --> Streaming: continuous visual context detected\n("follow along", UX review,\nflow walkthrough)
        Streaming --> Sleep: cooldown / topic changed /\nvisual context ended / guardrail pause

        Sleep --> Streaming: explicit continuous follow mode
    }

    note right of ScreenShareOn
      Runtime visual state is automatic:
      sleep | snapshot | streaming
      Frames are only sent while screen share is enabled.
    end note

    state "Screen Quality Policy" as QualityPolicy {
        [*] --> DetectTrack
        DetectTrack --> CapResolution

        DetectTrack: Detect actual capture size\nfrom stream/track settings
        CapResolution: Cap local frame size\n(target around 1920px max width,\nnot 640px)

        CapResolution --> EncodeJPEG
        EncodeJPEG: JPEG quality = 0.92

        EncodeJPEG --> SelectMediaResolution

        SelectMediaResolution --> LowMed: general visual context
        SelectMediaResolution --> High: text-dense / OCR / IDE /\nterminal / logs / tiny UI details

        LowMed --> SendFrame
        High --> SendFrame

        SendFrame --> [*]
    }

    note right of SelectMediaResolution
      Gemini media resolution trades off
      detail vs latency/cost:
      LOW = lower cost/detail
      MEDIUM = balanced
      HIGH = more detail, more cost/latency
    end note