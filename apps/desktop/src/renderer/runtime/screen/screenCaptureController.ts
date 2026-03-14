import { logRuntimeDiagnostic, logRuntimeError } from '../core/logger';
import type { RealtimeOutboundGateway } from '../outbound/outbound.types';
import { asErrorDetail } from '../core/runtimeUtils';
import type { DesktopSession } from '../transport/transport.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type {
  LocalScreenFrame,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
} from './screen.types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from './localScreenCapture';
import {
  SCREEN_CAPTURE_MAX_PENDING_FRAMES,
  SCREEN_CAPTURE_START_POLICY,
} from './screenCapturePolicy';
import type {
  SaveScreenFrameDumpFrameRequest,
  ScreenFrameDumpSessionInfo,
} from '../../../shared';

type ScreenCaptureStoreApi = {
  getState: () => {
    voiceSessionStatus: VoiceSessionStatus;
    screenCaptureState: ScreenCaptureState;
    setScreenCaptureState: (state: ScreenCaptureState) => void;
    setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
    setLastRuntimeError: (error: string | null) => void;
  };
};

export type ScreenCaptureController = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  stopInternal: (options?: {
    nextState?: 'disabled' | 'error';
    detail?: string | null;
    preserveDiagnostics?: boolean;
    uploadStatus?: 'idle' | 'error';
  }) => Promise<void>;
  resetDiagnostics: () => void;
  enqueueFrameSend: (frame: LocalScreenFrame) => Promise<void>;
  isActive: () => boolean;
  resetSendChain: () => void;
};

type ScreenFrameDumpControls = {
  shouldSaveFrames: () => boolean;
  startScreenFrameDumpSession: () => Promise<ScreenFrameDumpSessionInfo>;
  saveScreenFrameDumpFrame: (request: SaveScreenFrameDumpFrameRequest) => Promise<void>;
  setScreenFrameDumpDirectoryPath: (directoryPath: string | null) => void;
};

const VISUAL_SCREEN_CHANNEL_KEY = 'visual:screen';

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: (observer: LocalScreenCaptureObserver) => LocalScreenCapture,
  getTransport: () => DesktopSession | null,
  getRealtimeOutboundGateway: () => RealtimeOutboundGateway,
  screenFrameDumpControls?: ScreenFrameDumpControls,
): ScreenCaptureController {
  let screenCapture: LocalScreenCapture | null = null;
  let screenCaptureGeneration = 0;
  let stopInFlight: Promise<void> | null = null;
  let debugFrameDumpReady = false;
  let visualOutboundSequence = 0;
  let pendingFrame:
    | {
        capture: LocalScreenCapture;
        captureGeneration: number;
        frame: LocalScreenFrame;
        transport: DesktopSession;
      }
    | null = null;
  let frameDrainInFlight: Promise<void> | null = null;

  const resetDiagnostics = (): void => {
    store.getState().setScreenCaptureDiagnostics({
      captureSource: null,
      frameCount: 0,
      frameRateHz: null,
      widthPx: null,
      heightPx: null,
      lastFrameAt: null,
      lastUploadStatus: 'idle',
      lastError: null,
    });
  };

  const isCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): boolean => {
    return screenCapture === capture && screenCaptureGeneration === generation;
  };

  const releaseCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): void => {
    if (!isCurrentCapture(capture, generation)) {
      return;
    }

    screenCapture = null;
    screenCaptureGeneration += 1;
    debugFrameDumpReady = false;
  };

  const setScreenFrameDumpDirectoryPath = (directoryPath: string | null): void => {
    screenFrameDumpControls?.setScreenFrameDumpDirectoryPath(directoryPath);
  };

  const startScreenFrameDumpSession = async (
    capture: LocalScreenCapture,
    generation: number,
  ): Promise<void> => {
    debugFrameDumpReady = false;

    if (!screenFrameDumpControls?.shouldSaveFrames()) {
      return;
    }

    setScreenFrameDumpDirectoryPath(null);

    try {
      const session = await screenFrameDumpControls.startScreenFrameDumpSession();

      if (!isCurrentCapture(capture, generation)) {
        return;
      }

      debugFrameDumpReady = true;
      setScreenFrameDumpDirectoryPath(session.directoryPath);
    } catch (error) {
      if (!isCurrentCapture(capture, generation)) {
        return;
      }

      const detail = asErrorDetail(error, 'Failed to start screen frame dump');
      logRuntimeError('screen-capture', 'frame dump session start failed', { detail });
      store.getState().setLastRuntimeError(detail);
    }
  };

  const persistScreenFrameDump = (
    capture: LocalScreenCapture,
    generation: number,
    frame: LocalScreenFrame,
  ): void => {
    if (
      !screenFrameDumpControls ||
      !debugFrameDumpReady ||
      !screenFrameDumpControls.shouldSaveFrames()
    ) {
      return;
    }

    void screenFrameDumpControls.saveScreenFrameDumpFrame({
      sequence: frame.sequence,
      mimeType: frame.mimeType,
      data: frame.data,
    }).catch((error) => {
      if (!isCurrentCapture(capture, generation)) {
        return;
      }

      const detail = asErrorDetail(error, 'Failed to save screen frame dump');
      logRuntimeError('screen-capture', 'frame dump save failed', {
        detail,
        sequence: frame.sequence,
      });
      store.getState().setLastRuntimeError(detail);
    });
  };

  const stopCapture = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
      propagateStopError?: boolean;
    } = {},
  ): Promise<void> => {
    const {
      nextState = 'disabled',
      detail = null,
      preserveDiagnostics = false,
      uploadStatus = 'idle',
      propagateStopError = false,
    } = options;

    if (!screenCapture && stopInFlight) {
      return stopInFlight;
    }

    const capture = screenCapture;

    if (!capture) {
      store.getState().setScreenCaptureState(nextState);
      if (preserveDiagnostics) {
        store.getState().setScreenCaptureDiagnostics({
          lastUploadStatus: uploadStatus,
          lastError: detail,
        });
      } else {
        resetDiagnostics();
      }
      return Promise.resolve();
    }

      screenCapture = null;
      screenCaptureGeneration += 1;
      debugFrameDumpReady = false;
      pendingFrame = null;
      frameDrainInFlight = null;
      store.getState().setScreenCaptureState('stopping');

    const finalizeStop = async (): Promise<void> => {
      let stopError: unknown;

      try {
        await capture.stop();
      } catch (error) {
        stopError = error;
        logRuntimeError('screen-capture', 'capture stop failed', {
          detail: asErrorDetail(error, 'Failed to stop screen capture'),
        });
      } finally {
        store.getState().setScreenCaptureState(nextState);
        if (preserveDiagnostics) {
          store.getState().setScreenCaptureDiagnostics({
            lastUploadStatus: uploadStatus,
            lastError: detail,
          });
        } else {
          resetDiagnostics();
        }
        if (stopInFlight === stopPromise) {
          stopInFlight = null;
        }
      }

      if (stopError && propagateStopError) {
        throw stopError;
      }
    };

    const stopPromise = finalizeStop();
    stopInFlight = stopPromise;
    return stopPromise;
  };

  const stopInternal = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
    } = {},
  ): Promise<void> => {
    return stopCapture(options);
  };

  const enqueueFrameSend = (frame: LocalScreenFrame): Promise<void> => {
    const transport = getTransport();
    const capture = screenCapture;
    const captureGeneration = screenCaptureGeneration;

    // Resume swaps transports without replaying captured frames into the next session.
    // Frames produced while no active transport is attached are intentionally dropped.
    if (!transport || !capture) {
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
      return Promise.resolve();
    }

    pendingFrame = {
      capture,
      captureGeneration,
      frame,
      transport,
    };
    store.getState().setScreenCaptureDiagnostics({
      lastUploadStatus: 'sending',
      lastError: null,
    });

    const drainPendingFrames = (): Promise<void> => {
      if (frameDrainInFlight) {
        return frameDrainInFlight;
      }

      const drainPromise = (async () => {
        while (pendingFrame) {
          const nextFrame = pendingFrame;
          pendingFrame = null;

          if (
            getTransport() !== nextFrame.transport
            || !isCurrentCapture(nextFrame.capture, nextFrame.captureGeneration)
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
              getTransport() !== nextFrame.transport
              || !isCurrentCapture(nextFrame.capture, nextFrame.captureGeneration)
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
            store.getState().setLastRuntimeError(detail);
            pendingFrame = null;
            void stopInternal({
              nextState: 'error',
              detail,
              preserveDiagnostics: true,
              uploadStatus: 'error',
            });
            return;
          }

          if (
            getTransport() !== nextFrame.transport
            || !isCurrentCapture(nextFrame.capture, nextFrame.captureGeneration)
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
          store.getState().setScreenCaptureState('streaming');
          store.getState().setScreenCaptureDiagnostics({
            lastUploadStatus: 'sent',
            lastError: null,
          });
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

    return drainPendingFrames();
  };

  const start = async (): Promise<void> => {
    if (stopInFlight) {
      await stopInFlight;
    }

    const state = store.getState();
    const voiceStatus = state.voiceSessionStatus;
    const transport = getTransport();

    if (
      transport === null ||
      (
        voiceStatus !== 'ready' &&
        voiceStatus !== 'capturing' &&
        voiceStatus !== 'streaming' &&
        voiceStatus !== 'interrupted'
      )
    ) {
      const detail = 'Screen context requires an active Live session';
      state.setScreenCaptureState('error');
      state.setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      state.setLastRuntimeError(detail);
      return;
    }

    if (
      state.screenCaptureState === 'ready' ||
      state.screenCaptureState === 'capturing' ||
      state.screenCaptureState === 'streaming' ||
      state.screenCaptureState === 'requestingPermission' ||
      state.screenCaptureState === 'stopping'
    ) {
      return;
    }

    state.setScreenCaptureState('requestingPermission');
    resetDiagnostics();

    const captureGeneration = screenCaptureGeneration + 1;
    const capture = createCapture({
      onFrame: (frame: LocalScreenFrame) => {
        if (!isCurrentCapture(capture, captureGeneration) || !getTransport()) {
          return;
        }

        persistScreenFrameDump(capture, captureGeneration, frame);
        void enqueueFrameSend(frame);
      },
      onDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => {
        if (!isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        store.getState().setScreenCaptureDiagnostics(patch);
      },
      onError: (detail: string) => {
        if (!isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        logRuntimeError('screen-capture', 'capture error', { detail });
        store.getState().setLastRuntimeError(detail);
        void stopInternal({
          nextState: 'error',
          detail,
          preserveDiagnostics: true,
          uploadStatus: 'error',
        });
      },
    });
    screenCapture = capture;
    screenCaptureGeneration = captureGeneration;

    try {
      await capture.start(SCREEN_CAPTURE_START_POLICY);

      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      await startScreenFrameDumpSession(capture, captureGeneration);

      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      store.getState().setScreenCaptureState('ready');
      store.getState().setScreenCaptureState('capturing');
    } catch (error) {
      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      const detail = asErrorDetail(error, 'Screen capture failed to start');
      releaseCurrentCapture(capture, captureGeneration);
      store.getState().setScreenCaptureState('error');
      store.getState().setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      store.getState().setLastRuntimeError(detail);
    }
  };

  const stop = async (): Promise<void> => {
    const state = store.getState();

    if (
      state.screenCaptureState === 'disabled' ||
      state.screenCaptureState === 'stopping'
    ) {
      await stopInFlight;
      return;
    }

    await stopCapture({
      nextState: 'disabled',
      propagateStopError: true,
    });
  };

  return {
    start,
    stop,
    stopInternal,
    resetDiagnostics,
    enqueueFrameSend,
    isActive: () => screenCapture !== null,
    resetSendChain: () => {
      pendingFrame = null;
      frameDrainInFlight = null;
    },
  };
}
