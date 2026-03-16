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
  onFrameAccepted,
  onFrameBlockedByGateway,
  flushVisualDiagnostics,
  onSendStarted,
  onSendSucceeded,
  onSendFailed,
}: {
  getActiveCapture: GetActiveScreenCapture;
  isCurrentCapture: IsCurrentCapture;
  getTransport: GetTransport;
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway;
  onFrameAccepted: (frame: LocalScreenFrame) => void;
  onFrameBlockedByGateway: () => void;
  flushVisualDiagnostics: () => void;
  onSendStarted: () => void;
  onSendSucceeded: (frame: LocalScreenFrame) => void;
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
        onSendSucceeded(nextFrame.frame);
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

      onFrameAccepted(frame);
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
