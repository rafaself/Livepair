export type VisualSendEvent =
  | 'screenShareStarted'
  | 'screenShareStopped'
  | 'manualSendRequested'
  | 'manualFrameSent'
  | 'manualSendBlocked'
  | 'continuousStarted'
  | 'continuousStopped'
  | 'continuousFrameSent';

export type VisualSendDiagnostics = {
  lastEvent: VisualSendEvent | null;
  continuousCadenceMs: number;
  continuousActive: boolean;
  continuousStartedAt: string | null;
  continuousStoppedAt: string | null;
  continuousFramesSentCount: number;
  lastContinuousFrameAt: string | null;
  manualSendPending: boolean;
  manualFramesSentCount: number;
  lastManualFrameAt: string | null;
  blockedByGateway: number;
};

export function createDefaultVisualSendDiagnostics(
  continuousCadenceMs: number,
): VisualSendDiagnostics {
  return {
    lastEvent: null,
    continuousCadenceMs,
    continuousActive: false,
    continuousStartedAt: null,
    continuousStoppedAt: null,
    continuousFramesSentCount: 0,
    lastContinuousFrameAt: null,
    manualSendPending: false,
    manualFramesSentCount: 0,
    lastManualFrameAt: null,
    blockedByGateway: 0,
  };
}
