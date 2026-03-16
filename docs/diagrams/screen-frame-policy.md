stateDiagram-v2
    direction LR

    [*] --> ScreenShareOff

    ScreenShareOff --> ManualMode: user enables Share Screen\nmode = manual
    ScreenShareOff --> ContinuousMode: user enables Share Screen\nmode = continuous
    ManualMode --> ScreenShareOff: user disables Share Screen
    ContinuousMode --> ScreenShareOff: user disables Share Screen

    state ManualMode {
        [*] --> WaitingForManualSend
        WaitingForManualSend --> ManualSend: user clicks Send now
        ManualSend --> WaitingForManualSend: outbound frame sent
    }

    state ContinuousMode {
        [*] --> BaseCadence
        BaseCadence --> BaseCadence: outbound base frame every 3000 ms
        BaseCadence --> BurstWindow: meaningful thumbnail change
        BurstWindow --> BurstWindow: outbound burst frame every 1000 ms
        BurstWindow --> BaseCadence: burst window ends
    }

    note right of ManualMode
      Manual mode sends only on explicit user action.
      Manual sends always use high detail.
    end note

    note right of ContinuousMode
      Continuous mode keeps the 3000 ms base cadence.
      Meaningful thumbnail changes open a bounded 1000 ms burst window.
      Continuous mode defaults to medium quality.
    end note
