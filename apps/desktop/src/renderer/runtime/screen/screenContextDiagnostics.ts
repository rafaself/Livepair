export type VisualSendEvent =
  | 'screenShareStarted'
  | 'screenShareStopped'
  | 'manualSendRequested'
  | 'manualFrameSent'
  | 'manualSendBlocked'
  | 'continuousStarted'
  | 'continuousStopped'
  | 'burstActivated'
  | 'baselineFrameSent'
  | 'burstFrameSent';

export type VisualSendDiagnostics = {
  lastEvent: VisualSendEvent | null;
  continuousCadenceMs: number;
  burstCadenceMs: number;
  continuousActive: boolean;
  continuousStartedAt: string | null;
  continuousStoppedAt: string | null;
  burstActive: boolean;
  burstUntil: string | null;
  changeSignalCount: number;
  burstTriggeredCount: number;
  autoFramesSentCount: number;
  lastAutoFrameAt: string | null;
  lastAutoFrameKind: 'baseline' | 'burst' | null;
  manualSendPending: boolean;
  manualFramesSentCount: number;
  lastManualFrameAt: string | null;
  blockedByGateway: number;
};

export function createDefaultVisualSendDiagnostics(
  continuousCadenceMs: number,
  burstCadenceMs: number,
): VisualSendDiagnostics {
  return {
    lastEvent: null,
    continuousCadenceMs,
    burstCadenceMs,
    continuousActive: false,
    continuousStartedAt: null,
    continuousStoppedAt: null,
    burstActive: false,
    burstUntil: null,
    changeSignalCount: 0,
    burstTriggeredCount: 0,
    autoFramesSentCount: 0,
    lastAutoFrameAt: null,
    lastAutoFrameKind: null,
    manualSendPending: false,
    manualFramesSentCount: 0,
    lastManualFrameAt: null,
    blockedByGateway: 0,
  };
}
