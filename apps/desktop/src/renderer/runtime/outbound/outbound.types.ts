export type RealtimeOutboundEventKind = 'text' | 'audio_chunk' | 'visual_frame';

type RealtimeOutboundEventBase<TKind extends RealtimeOutboundEventKind> = {
  kind: TKind;
  channelKey: string;
  sequence: number;
  createdAtMs: number;
  estimatedBytes: number | null;
};

export type RealtimeOutboundTextEvent = RealtimeOutboundEventBase<'text'>;

export type RealtimeOutboundAudioChunkEvent =
  RealtimeOutboundEventBase<'audio_chunk'>;

export type RealtimeOutboundVisualFrameEvent =
  RealtimeOutboundEventBase<'visual_frame'> & {
    replaceKey: string;
  };

export type RealtimeOutboundEvent =
  | RealtimeOutboundTextEvent
  | RealtimeOutboundAudioChunkEvent
  | RealtimeOutboundVisualFrameEvent;

export type RealtimeOutboundClassification =
  | 'replaceable'
  | 'non-replaceable';

export type RealtimeOutboundDecisionOutcome =
  | 'send'
  | 'drop'
  | 'replace'
  | 'block';

export type RealtimeOutboundDecisionReason =
  | 'accepted'
  | 'stale-sequence'
  | 'superseded-latest'
  | 'lane-saturated'
  | 'breaker-open';

export type RealtimeOutboundBreakerState = 'closed' | 'open';

export type RealtimeOutboundDecision = {
  outcome: RealtimeOutboundDecisionOutcome;
  classification: RealtimeOutboundClassification;
  reason: RealtimeOutboundDecisionReason;
};

export type RealtimeOutboundDiagnostics = {
  breakerState: RealtimeOutboundBreakerState;
  breakerReason: string | null;
  consecutiveFailureCount: number;
  totalSubmitted: number;
  sentCount: number;
  droppedCount: number;
  replacedCount: number;
  blockedCount: number;
  droppedByReason: {
    staleSequence: number;
    laneSaturated: number;
  };
  blockedByReason: {
    breakerOpen: number;
  };
  submittedByKind: {
    text: number;
    audioChunk: number;
    visualFrame: number;
  };
  lastDecision: RealtimeOutboundDecisionOutcome | null;
  lastReason: RealtimeOutboundDecisionReason | null;
  lastEventKind: RealtimeOutboundEventKind | null;
  lastChannelKey: string | null;
  lastSequence: number | null;
  lastReplaceKey: string | null;
  lastSubmittedAtMs: number | null;
  lastError: string | null;
};

export type RealtimeOutboundGatewayOptions = {
  maxConsecutiveFailures?: number;
  onDiagnosticsChanged?: (diagnostics: RealtimeOutboundDiagnostics) => void;
};

export type RealtimeOutboundGateway = {
  submit: (event: RealtimeOutboundEvent) => RealtimeOutboundDecision;
  settle: (event: RealtimeOutboundEvent) => void;
  recordFailure: (detail: string) => void;
  recordSuccess: () => void;
  reset: () => void;
  getDiagnostics: () => RealtimeOutboundDiagnostics;
};
