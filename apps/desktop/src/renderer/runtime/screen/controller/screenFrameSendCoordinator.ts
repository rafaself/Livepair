import { asErrorDetail } from '../../core/runtimeUtils';
import type { DesktopSession } from '../../transport/transport.types';
import { SCREEN_CAPTURE_MAX_PENDING_FRAMES } from '../screenCapturePolicy';
import type {
  GetActiveScreenCapture,
  GetRealtimeOutboundGateway,
  GetTransport,
  IsCurrentCapture,
} from './screenCaptureControllerTypes';
import type { ScreenOutboundFrameRequest } from './screenFrameContracts';
import type { LiveRuntimeDiagnosticEvent } from '../../session/liveRuntimeObservability';

const VISUAL_SCREEN_CHANNEL_KEY = 'visual:screen';

type PendingScreenFrame = {
  capture: NonNullable<ReturnType<GetActiveScreenCapture>>['capture'];
  captureGeneration: number;
  request: ScreenOutboundFrameRequest;
  transport: DesktopSession;
};

export type ScreenFrameSendCoordinator = {
  enqueueFrameSend: (request: ScreenOutboundFrameRequest) => Promise<void>;
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
  emitDiagnostic,
}: {
  getActiveCapture: GetActiveScreenCapture;
  isCurrentCapture: IsCurrentCapture;
  getTransport: GetTransport;
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway;
  onFrameAccepted: (request: ScreenOutboundFrameRequest) => void;
  onFrameBlockedByGateway: () => void;
  flushVisualDiagnostics: () => void;
  onSendStarted: () => void;
  onSendSucceeded: (request: ScreenOutboundFrameRequest) => void;
  onSendFailed: (detail: string) => void;
  emitDiagnostic?: (event: LiveRuntimeDiagnosticEvent) => void;
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
          const { frame } = nextFrame.request;
          await nextFrame.transport.submit({
            type: 'video-frame',
            data: frame.data,
            mimeType: frame.mimeType,
          });
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
          const { frame } = nextFrame.request;
          emitDiagnostic?.({
            scope: 'screen-capture',
            name: 'video-frame-send-failed',
            level: 'error',
            detail,
            data: {
              sequence: frame.sequence,
              mimeType: frame.mimeType,
              byteLength: frame.data.byteLength,
              widthPx: frame.widthPx,
              heightPx: frame.heightPx,
            },
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
        const { frame } = nextFrame.request;
        emitDiagnostic?.({
          scope: 'screen-capture',
          name: 'video-frame-sent',
          data: {
            sequence: frame.sequence,
            mimeType: frame.mimeType,
            byteLength: frame.data.byteLength,
            widthPx: frame.widthPx,
            heightPx: frame.heightPx,
            maxPendingFrames: SCREEN_CAPTURE_MAX_PENDING_FRAMES,
          },
        });
        onSendSucceeded(nextFrame.request);
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
    enqueueFrameSend: (request) => {
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
        estimatedBytes: request.frame.data.byteLength,
      });

      if (decision.outcome === 'drop' || decision.outcome === 'block') {
        // Wave 4: policy allowed the send but the gateway blocked/dropped it.
        emitDiagnostic?.({
          scope: 'screen-capture',
          name: 'video-frame-blocked-by-gateway',
          data: {
            outcome: decision.outcome,
            reason: decision.reason,
          },
        });
        onFrameBlockedByGateway();
        flushVisualDiagnostics();
        return Promise.resolve();
      }

      onFrameAccepted(request);
      flushVisualDiagnostics();

      pendingFrame = {
        capture: activeCapture.capture,
        captureGeneration: activeCapture.generation,
        request,
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
