import { logRuntimeDiagnostic, logRuntimeError } from '../../core/logger';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { DesktopSession } from '../../transport/transport.types';
import { SCREEN_CAPTURE_MAX_PENDING_FRAMES } from '../screenCapturePolicy';
import type { LocalScreenFrame } from '../screen.types';
import type {
  GetActiveScreenCapture,
  GetRealtimeOutboundGateway,
  GetTransport,
  IsCurrentCapture,
} from './screenCaptureControllerTypes';

const VISUAL_SCREEN_CHANNEL_KEY = 'visual:screen';

type PendingScreenFrame = {
  capture: NonNullable<ReturnType<GetActiveScreenCapture>>['capture'];
  captureGeneration: number;
  frame: LocalScreenFrame;
  transport: DesktopSession;
};

export type ScreenFrameSendCoordinator = {
  enqueueFrameSend: (frame: LocalScreenFrame) => Promise<void>;
  reset: () => void;
};

export function createScreenFrameSendCoordinator({
  getActiveCapture,
  isCurrentCapture,
  getTransport,
  getRealtimeOutboundGateway,
  allowSend,
  onFrameDispatched,
  onFrameDroppedByPolicy,
  onFrameBlockedByGateway,
  shouldSendFrame,
  flushVisualDiagnostics,
  onSendStarted,
  onSendSucceeded,
  onSendFailed,
}: {
  getActiveCapture: GetActiveScreenCapture;
  isCurrentCapture: IsCurrentCapture;
  getTransport: GetTransport;
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway;
  allowSend: () => boolean;
  /**
   * Wave 3 – called immediately after the gateway accepts a frame for dispatch.
   * Triggers the consuming side-effects in the visual policy (snapshot → sleep
   * transition, counter increments) so they only occur when the frame will
   * actually reach the transport.
   */
  onFrameDispatched: () => void;
  /**
   * Wave 4 – called when a frame is dropped because allowSend() returned false.
   * Records the drop in policy diagnostics for capture-vs-send distinction.
   */
  onFrameDroppedByPolicy: () => void;
  /**
   * Wave 4 – called when a frame passed allowSend() but the outbound gateway
   * returned block or drop. Records the outcome in policy diagnostics.
   */
  onFrameBlockedByGateway: () => void;
  /**
   * Wave 3 – optional per-frame relevance check.  Called after allowSend()
   * passes but before gateway submission.  If it returns false the frame is
   * treated as dropped-by-policy (e.g. burst send gate / throttle).
   */
  shouldSendFrame?: (frame: LocalScreenFrame) => boolean;
  flushVisualDiagnostics: () => void;
  onSendStarted: () => void;
  onSendSucceeded: () => void;
  onSendFailed: (detail: string) => void;
}): ScreenFrameSendCoordinator {
  let visualOutboundSequence = 0;
  let pendingFrame: PendingScreenFrame | null = null;
  let frameDrainInFlight: Promise<void> | null = null;

  const isCurrentFrame = (
    frameTransport: DesktopSession,
    capture: PendingScreenFrame['capture'],
    captureGeneration: number,
  ): boolean => {
    return (
      getTransport() === frameTransport
      && isCurrentCapture(capture, captureGeneration)
    );
  };

  const drainPendingFrames = (): Promise<void> => {
    if (frameDrainInFlight) {
      return frameDrainInFlight;
    }

    const drainPromise = (async () => {
      while (pendingFrame) {
        const nextFrame = pendingFrame;
        pendingFrame = null;

        if (
          !isCurrentFrame(
            nextFrame.transport,
            nextFrame.capture,
            nextFrame.captureGeneration,
          )
        ) {
          continue;
        }

        try {
          await nextFrame.transport.sendVideoFrame(
            nextFrame.frame.data,
            nextFrame.frame.mimeType,
          );
        } catch (error) {
          if (
            !isCurrentFrame(
              nextFrame.transport,
              nextFrame.capture,
              nextFrame.captureGeneration,
            )
          ) {
            continue;
          }

          const detail = asErrorDetail(error, 'Failed to send screen frame');
          getRealtimeOutboundGateway().recordFailure(detail);
          logRuntimeError('screen-capture', 'video frame send failed', {
            detail,
            sequence: nextFrame.frame.sequence,
            mimeType: nextFrame.frame.mimeType,
            byteLength: nextFrame.frame.data.byteLength,
            widthPx: nextFrame.frame.widthPx,
            heightPx: nextFrame.frame.heightPx,
          });
          pendingFrame = null;
          onSendFailed(detail);
          return;
        }

        if (
          !isCurrentFrame(
            nextFrame.transport,
            nextFrame.capture,
            nextFrame.captureGeneration,
          )
        ) {
          continue;
        }

        getRealtimeOutboundGateway().recordSuccess();
        logRuntimeDiagnostic('screen-capture', 'video frame sent', {
          sequence: nextFrame.frame.sequence,
          mimeType: nextFrame.frame.mimeType,
          byteLength: nextFrame.frame.data.byteLength,
          widthPx: nextFrame.frame.widthPx,
          heightPx: nextFrame.frame.heightPx,
          maxPendingFrames: SCREEN_CAPTURE_MAX_PENDING_FRAMES,
        });
        onSendSucceeded();
      }
    })().finally(() => {
      if (frameDrainInFlight === drainPromise) {
        frameDrainInFlight = null;
      }

      if (pendingFrame) {
        void drainPendingFrames();
      }
    });

    frameDrainInFlight = drainPromise;
    return drainPromise;
  };

  return {
    enqueueFrameSend: (frame) => {
      const transport = getTransport();
      const activeCapture = getActiveCapture();

      if (!transport || !activeCapture) {
        return Promise.resolve();
      }

      if (!allowSend()) {
        // Wave 4: frame was captured but policy (inactive/sleep) prevented send.
        onFrameDroppedByPolicy();
        flushVisualDiagnostics();
        return Promise.resolve();
      }

      // Wave 3: per-frame relevance check (burst send gate / throttle).
      if (shouldSendFrame && !shouldSendFrame(frame)) {
        onFrameDroppedByPolicy();
        flushVisualDiagnostics();
        return Promise.resolve();
      }

      visualOutboundSequence += 1;
      const decision = getRealtimeOutboundGateway().submit({
        kind: 'visual_frame',
        channelKey: VISUAL_SCREEN_CHANNEL_KEY,
        replaceKey: VISUAL_SCREEN_CHANNEL_KEY,
        sequence: visualOutboundSequence,
        createdAtMs: Date.now(),
        estimatedBytes: frame.data.byteLength,
      });

      if (decision.outcome === 'drop' || decision.outcome === 'block') {
        // Wave 4: policy allowed the send but the gateway blocked/dropped it.
        onFrameBlockedByGateway();
        flushVisualDiagnostics();
        return Promise.resolve();
      }

      // Wave 3: consume the snapshot (or increment streaming counter) only now
      // that the gateway has accepted the frame for dispatch.  This prevents
      // snapshot state from being silently consumed when the gateway blocks.
      onFrameDispatched();
      flushVisualDiagnostics();

      pendingFrame = {
        capture: activeCapture.capture,
        captureGeneration: activeCapture.generation,
        frame,
        transport,
      };
      onSendStarted();
      return drainPendingFrames();
    },
    reset: () => {
      pendingFrame = null;
      frameDrainInFlight = null;
    },
  };
}
