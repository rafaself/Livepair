import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenCaptureController } from './screenCaptureController';
import { createDefaultRealtimeOutboundDiagnostics } from '../outbound/realtimeOutboundGateway';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
} from '../outbound/outbound.types';
import type { DesktopSession } from '../transport/transport.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type { ScreenCaptureState } from './screen.types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from './localScreenCapture';
import type { ContinuousScreenQuality, ScreenContextMode } from '../../../shared/settings';
import { getScreenCaptureQualityParams } from './screenCapturePolicy';

function createHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
  saveScreenFramesEnabled?: boolean;
  submitDecision?: (callIndex: number) => RealtimeOutboundDecision;
  continuousSendIntervalMs?: number;
} = {}) {
  let mode: ScreenContextMode = 'continuous';
  let quality: ContinuousScreenQuality = 'medium';
  const setMode = (nextMode: ScreenContextMode) => {
    mode = nextMode;
  };
  const setQuality = (nextQuality: ContinuousScreenQuality) => {
    quality = nextQuality;
  };

  const { voiceSessionStatus = 'ready', screenCaptureState = 'disabled' } = options;
  let currentScreenState: ScreenCaptureState = screenCaptureState;
  const currentVoiceStatus: VoiceSessionStatus = voiceSessionStatus;

  const setScreenCaptureState = vi.fn((state: ScreenCaptureState) => {
    currentScreenState = state;
  });
  const setScreenCaptureDiagnostics = vi.fn();
  const setVisualSendDiagnostics = vi.fn();
  const setLastRuntimeError = vi.fn();
  const store = {
    getState: () => ({
      voiceSessionStatus: currentVoiceStatus,
      screenCaptureState: currentScreenState,
      setScreenCaptureState,
      setScreenCaptureDiagnostics,
      setVisualSendDiagnostics,
      setLastRuntimeError,
    }),
  };

  let observer: LocalScreenCaptureObserver | null = null;
  const capture = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    updateQuality: vi.fn(),
  } satisfies LocalScreenCapture;
  const createCapture = vi.fn((nextObserver: LocalScreenCaptureObserver) => {
    observer = nextObserver;
    return capture;
  });

  const sendVideoFrame = vi.fn(async () => undefined);
  const transport = { sendVideoFrame } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;

  let submitCount = 0;
  const outboundGateway: RealtimeOutboundGateway = {
    submit: vi.fn((_event: RealtimeOutboundEvent): RealtimeOutboundDecision => {
      submitCount += 1;
      return options.submitDecision?.(submitCount) ?? {
        outcome: 'send',
        classification: 'replaceable',
        reason: 'accepted',
      };
    }),
    settle: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    getDiagnostics: vi.fn(createDefaultRealtimeOutboundDiagnostics),
  };

  const startScreenFrameDumpSession = vi.fn(async () => ({
    directoryPath: '/tmp/livepair/screen-frame-dumps/wave3',
  }));
  const saveScreenFrameDumpFrame = vi.fn(async () => undefined);
  const setScreenFrameDumpDirectoryPath = vi.fn();

  const ctrl = createScreenCaptureController(
    store,
    createCapture,
    () => currentTransport,
    () => outboundGateway,
    {
      shouldSaveFrames: () => options.saveScreenFramesEnabled ?? false,
      startScreenFrameDumpSession,
      saveScreenFrameDumpFrame,
      setScreenFrameDumpDirectoryPath,
    },
    {
      continuousSendIntervalMs: options.continuousSendIntervalMs ?? 3000,
    },
    () => quality,
    () => mode,
  );

  return {
    ctrl,
    capture,
    createCapture,
    getObserver: () => observer,
    outboundGateway,
    saveScreenFrameDumpFrame,
    sendVideoFrame,
    setMode,
    setQuality,
    setTransport: (nextTransport: DesktopSession | null) => {
      currentTransport = nextTransport;
    },
    store: {
      setScreenCaptureDiagnostics,
      setScreenCaptureState,
      setVisualSendDiagnostics,
    },
  };
}

function emitFrame(
  observer: LocalScreenCaptureObserver | null,
  sequence: number,
  byte: number = sequence,
): void {
  observer?.onFrame({
    data: new Uint8Array([byte]),
    mimeType: 'image/jpeg',
    sequence,
    widthPx: 640,
    heightPx: 360,
  });
}

describe('createScreenCaptureController – Wave 3 continuous mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('auto-sends on a fixed 3000 ms cadence while screen share is active', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1);

    await vi.advanceTimersByTimeAsync(2999);
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    emitFrame(harness.getObserver(), 2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(
      new Uint8Array([2]),
      'image/jpeg',
    );
  });

  it('uses Medium as the default continuous quality and applies quality updates while active', async () => {
    const harness = createHarness();

    await harness.ctrl.start();

    expect(harness.capture.start).toHaveBeenCalledWith(
      expect.objectContaining(getScreenCaptureQualityParams('medium')),
    );

    harness.setQuality('low');
    emitFrame(harness.getObserver(), 1);
    expect(harness.capture.updateQuality).toHaveBeenCalledWith(
      getScreenCaptureQualityParams('low'),
    );
  });

  it('starts and stops continuous scheduling when the screen mode changes', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.setMode('manual');
    emitFrame(harness.getObserver(), 2);

    await vi.advanceTimersByTimeAsync(6000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.setMode('continuous');
    emitFrame(harness.getObserver(), 3);

    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(
      new Uint8Array([3]),
      'image/jpeg',
    );
  });

  it('saves debug frames only for actual outbound continuous sends', async () => {
    const harness = createHarness({
      saveScreenFramesEnabled: true,
      submitDecision: (callIndex) => ({
        outcome: callIndex === 1 ? 'block' : 'send',
        classification: 'replaceable',
        reason: callIndex === 1 ? 'breaker-open' : 'accepted',
      }),
    });

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1);

    expect(harness.saveScreenFrameDumpFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
    expect(harness.saveScreenFrameDumpFrame).not.toHaveBeenCalled();

    emitFrame(harness.getObserver(), 2);
    await vi.advanceTimersByTimeAsync(3000);

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(harness.saveScreenFrameDumpFrame).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 2 }),
    );
  });

  it('does not expose legacy trigger or explicit streaming APIs', () => {
    const harness = createHarness();

    expect('enableStreaming' in harness.ctrl).toBe(false);
    expect('stopStreaming' in harness.ctrl).toBe(false);
    expect('onSpeechStart' in harness.ctrl).toBe(false);
    expect('onTextSent' in harness.ctrl).toBe(false);
    expect('getVisualSendState' in harness.ctrl).toBe(false);
  });
});
