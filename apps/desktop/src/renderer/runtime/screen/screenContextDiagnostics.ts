export type VisualSendEvent =
  | 'screenShareStarted'
  | 'screenShareStopped'
  | 'manualSendRequested'
  | 'manualFrameSent'
  | 'manualSendBlocked'
  | 'continuousStarted'
  | 'continuousStopped'
  | 'burstActivated'
  | 'continuousBaseFrameSent'
  | 'continuousBurstFrameSent';

export type VisualSendDiagnostics = {
  lastEvent: VisualSendEvent | null;
  continuousCadenceMs: number;
  burstCadenceMs: number;
  continuousActive: boolean;
  continuousStartedAt: string | null;
  continuousStoppedAt: string | null;
  burstActive: boolean;
  burstUntil: string | null;
  meaningfulChangeCount: number;
  burstActivationCount: number;
  continuousFramesSentCount: number;
  lastContinuousFrameAt: string | null;
  lastContinuousFrameReason: 'base' | 'burst' | null;
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
    meaningfulChangeCount: 0,
    burstActivationCount: 0,
    continuousFramesSentCount: 0,
    lastContinuousFrameAt: null,
    lastContinuousFrameReason: null,
    manualSendPending: false,
    manualFramesSentCount: 0,
    lastManualFrameAt: null,
    blockedByGateway: 0,
  };
}
