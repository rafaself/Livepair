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
import type { ScreenFrameAnalysis } from './screenFrameAnalysis';

function createAnalysis(fill = 32): ScreenFrameAnalysis {
  return {
    widthPx: 160,
    heightPx: 90,
    tileLuminance: new Array(40).fill(fill),
    tileEdge: new Array(40).fill(2),
    perceptualHash: 0n,
  };
}

function createChangedAnalysis(): ScreenFrameAnalysis {
  const tileLuminance = new Array(40).fill(32);
  const tileEdge = new Array(40).fill(2);

  tileLuminance[18] = 180;
  tileLuminance[19] = 150;
  tileEdge[18] = 120;
  tileEdge[19] = 96;

  return {
    widthPx: 160,
    heightPx: 90,
    tileLuminance,
    tileEdge,
    perceptualHash: 0b1111000011110000n,
  };
}

function createHarness(options: {
  voiceSessionStatus?: VoiceSessionStatus;
  screenCaptureState?: ScreenCaptureState;
  saveScreenFramesEnabled?: boolean;
  submitDecision?: (callIndex: number) => RealtimeOutboundDecision;
  continuousSendIntervalMs?: number;
  burstSendIntervalMs?: number;
  burstWindowMs?: number;
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
    directoryPath: '/tmp/livepair/screen-frame-dumps/wave4',
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
      burstSendIntervalMs: options.burstSendIntervalMs ?? 1000,
      burstWindowMs: options.burstWindowMs ?? 1000,
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
  options: {
    byte?: number;
    bytes?: Uint8Array;
    analysis?: ScreenFrameAnalysis;
  } = {},
): void {
  observer?.onFrame({
    data: options.bytes ?? new Uint8Array([options.byte ?? sequence]),
    mimeType: 'image/jpeg',
    sequence,
    widthPx: 640,
    heightPx: 360,
    analysis: options.analysis ?? createAnalysis(sequence),
  });
}

describe('createScreenCaptureController – Wave 4 burst mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T22:41:00.000Z'));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('auto-sends on a fixed 3000 ms cadence while the screen stays static', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });

    await vi.advanceTimersByTimeAsync(2999);
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    emitFrame(harness.getObserver(), 2, { analysis: createAnalysis() });
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
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });
    expect(harness.capture.updateQuality).toHaveBeenCalledWith(
      getScreenCaptureQualityParams('low'),
    );
  });

  it('accelerates to a temporary 1000 ms burst when the thumbnail signal changes meaningfully', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 2, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 3, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    emitFrame(harness.getObserver(), 4, {
      byte: 4,
      analysis: createChangedAnalysis(),
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(
      new Uint8Array([4]),
      'image/jpeg',
    );
  });

  it('returns to the 3000 ms baseline after the burst window expires without suppressing baseline sends', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 2, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 3, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    emitFrame(harness.getObserver(), 4, { byte: 4, analysis: createChangedAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1499);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(3);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(
      new Uint8Array([4]),
      'image/jpeg',
    );
  });

  it('uses thumbnail analysis instead of JPEG-byte equality to trigger bursts', async () => {
    const harness = createHarness();
    const reusedBytes = new Uint8Array([9, 9, 9]);

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { bytes: reusedBytes, analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 2, { bytes: reusedBytes, analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 3, { bytes: reusedBytes, analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    emitFrame(harness.getObserver(), 4, {
      bytes: reusedBytes,
      analysis: createChangedAnalysis(),
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(reusedBytes, 'image/jpeg');
  });

  it('starts and stops continuous scheduling when the screen mode changes', async () => {
    const harness = createHarness();

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });

    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.setMode('manual');
    emitFrame(harness.getObserver(), 2, { analysis: createAnalysis() });

    await vi.advanceTimersByTimeAsync(6000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);

    harness.setMode('continuous');
    emitFrame(harness.getObserver(), 3, { analysis: createAnalysis() });

    await vi.advanceTimersByTimeAsync(3000);
    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(2);
    expect(harness.sendVideoFrame).toHaveBeenLastCalledWith(
      new Uint8Array([3]),
      'image/jpeg',
    );
  });

  it('saves debug frames only for actual outbound continuous sends and tags them with sent metadata', async () => {
    const harness = createHarness({
      saveScreenFramesEnabled: true,
      submitDecision: (callIndex) => ({
        outcome: callIndex === 1 ? 'block' : 'send',
        classification: 'replaceable',
        reason: callIndex === 1 ? 'breaker-open' : 'accepted',
      }),
    });

    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 2, { analysis: createAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);
    emitFrame(harness.getObserver(), 3, { analysis: createAnalysis() });

    expect(harness.saveScreenFrameDumpFrame).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.sendVideoFrame).not.toHaveBeenCalled();
    expect(harness.saveScreenFrameDumpFrame).not.toHaveBeenCalled();

    emitFrame(harness.getObserver(), 4, { byte: 4, analysis: createChangedAnalysis() });
    await vi.advanceTimersByTimeAsync(1000);

    expect(harness.sendVideoFrame).toHaveBeenCalledTimes(1);
    expect(harness.saveScreenFrameDumpFrame).toHaveBeenCalledWith(
      {
        sequence: 4,
        mimeType: 'image/jpeg',
        data: new Uint8Array([4]),
        savedAt: '2026-03-15T22:41:04.000Z',
        mode: 'continuous',
        quality: 'medium',
        reason: 'burst',
      },
    );
  });

  it('tags manual debug saves as explicit sent frames', async () => {
    const harness = createHarness({
      saveScreenFramesEnabled: true,
    });

    harness.setMode('manual');
    await harness.ctrl.start();
    emitFrame(harness.getObserver(), 1, { analysis: createAnalysis() });

    harness.ctrl.analyzeScreenNow();
    emitFrame(harness.getObserver(), 2, { byte: 2, analysis: createChangedAnalysis() });

    await vi.waitFor(() => {
      expect(harness.saveScreenFrameDumpFrame).toHaveBeenCalledWith({
        sequence: 2,
        mimeType: 'image/jpeg',
        data: new Uint8Array([2]),
        savedAt: expect.stringMatching(/^2026-03-15T22:41:00\./),
        mode: 'manual',
        quality: 'high',
        reason: 'manual',
      });
    });
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
