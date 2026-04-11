import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerPublicApi } from './sessionPublicApi';
import { createDefaultRealtimeOutboundDiagnostics } from '../outbound/realtimeOutboundGateway';
import type {
  RealtimeOutboundDecision,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
} from '../outbound/outbound.types';

function createHarness(options: {
  gatewayDecision?: RealtimeOutboundDecision;
  refreshScreenCaptureSourceSnapshotResult?: boolean;
} = {}) {
  const setLastRuntimeError = vi.fn();
  const setScreenShareIntended = vi.fn();
  const store = {
    getState: vi.fn(() => ({
      setAssistantState: vi.fn(),
      setLastRuntimeError,
      setScreenShareIntended,
      setVoiceCaptureState: vi.fn(),
      setVoiceSessionStatus: vi.fn(),
      voiceCaptureState: 'inactive',
    })),
  } as never;

  const screenCtrl = {
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    analyzeNow: vi.fn(),
    isActive: vi.fn(() => false),
  };

  const sendText = vi.fn(async (_text: string) => undefined);
  const activeTransport = {
    kind: 'gemini-live' as const,
    submit: vi.fn(async (request: { type: 'text'; text: string }) => sendText(request.text)),
  };
  const outboundGateway: RealtimeOutboundGateway = {
    submit: vi.fn((_event: RealtimeOutboundEvent): RealtimeOutboundDecision => {
      return options.gatewayDecision ?? {
        outcome: 'send',
        classification: 'non-replaceable',
        reason: 'accepted',
      };
    }),
    settle: vi.fn(),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    reset: vi.fn(),
    getDiagnostics: vi.fn(createDefaultRealtimeOutboundDiagnostics),
  };
  const appendTypedUserTurn = vi.fn(() => 'turn-1');
  const queueMixedModeAssistantReply = vi.fn();
  const clearQueuedMixedModeAssistantReply = vi.fn();
  const syncSpeechSilenceTimeout = vi.fn();
  const setVoiceErrorState = vi.fn();
  const logRuntimeError = vi.fn();
  const supervisor = {
    checkBackendHealth: vi.fn(async () => undefined),
    startSession: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
    endSpeechMode: vi.fn(async () => undefined),
  };
  const refreshScreenCaptureSourceSnapshot = vi.fn(
    async () => options.refreshScreenCaptureSourceSnapshotResult ?? true,
  );
  const onCommand = vi.fn();

  const publicApi = createSessionControllerPublicApi({
    store,
    supervisor,
    voiceChunkCtrl: {
      addChunkListener: vi.fn(() => () => undefined),
      flush: vi.fn(async () => undefined),
      getVoiceCapture: vi.fn(() => ({ stop: vi.fn(async () => undefined) })),
      startCapture: vi.fn(async () => true),
    },
    screenCtrl,
    refreshScreenCaptureSourceSnapshot,
    appendTypedUserTurn,
    voiceTranscriptCtrl: {
      queueMixedModeAssistantReply,
      clearQueuedMixedModeAssistantReply,
    },
    runtime: {
      currentSpeechLifecycleStatus: vi.fn(() => 'listening' as const),
      handleSessionCommand: vi.fn(() => ({ accepted: true as const })),
      getActiveTransport: vi.fn(() => activeTransport as never),
      getRealtimeOutboundGateway: vi.fn(() => outboundGateway),
      recordSessionEvent: vi.fn(),
      setVoiceErrorState,
      syncSpeechSilenceTimeout,
    },
    logRuntimeError,
    onCommand,
  });

  return {
    publicApi,
    screenCtrl,
    sendText,
    outboundGateway,
    appendTypedUserTurn,
    queueMixedModeAssistantReply,
    clearQueuedMixedModeAssistantReply,
    setLastRuntimeError,
    setScreenShareIntended,
    refreshScreenCaptureSourceSnapshot,
    syncSpeechSilenceTimeout,
    setVoiceErrorState,
    logRuntimeError,
    supervisor,
    onCommand,
  };
}

describe('createSessionControllerPublicApi', () => {
  it('delegates lifecycle commands to the runtime supervisor', async () => {
    const harness = createHarness();

    await harness.publicApi.startSession({ mode: 'speech' });
    await harness.publicApi.endSession();
    await harness.publicApi.endSpeechMode();
    await harness.publicApi.checkBackendHealth();

    expect(harness.supervisor.startSession).toHaveBeenCalledWith({ mode: 'speech' });
    expect(harness.supervisor.endSession).toHaveBeenCalledTimes(1);
    expect(harness.supervisor.endSpeechMode).toHaveBeenCalledTimes(1);
    expect(harness.supervisor.checkBackendHealth).toHaveBeenCalledTimes(1);
    expect(harness.onCommand).toHaveBeenCalledWith({ type: 'session.start', mode: 'speech' });
    expect(harness.onCommand).toHaveBeenCalledWith({ type: 'session.end' });
    expect(harness.onCommand).toHaveBeenCalledWith({ type: 'speechMode.end' });
    expect(harness.onCommand).toHaveBeenCalledWith({ type: 'backend.checkHealth' });
  });

  it('routes text sends through the outbound gateway and keeps them non-replaceable', async () => {
    const harness = createHarness();

    await expect(harness.publicApi.submitTextTurn('Keep going')).resolves.toBe(true);

    expect(harness.outboundGateway.submit).toHaveBeenCalledWith({
      kind: 'text',
      channelKey: 'text:speech-mode',
      sequence: 1,
      createdAtMs: expect.any(Number),
      estimatedBytes: 10,
    });
    expect(harness.sendText).toHaveBeenCalledWith('Keep going');
    expect(harness.outboundGateway.recordSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps text effectively immediate instead of inheriting media queue semantics', async () => {
    const harness = createHarness();
    let resolveFirstSend!: () => void;
    harness.sendText
      .mockImplementationOnce(
        () =>
          new Promise<undefined>((resolve) => {
            resolveFirstSend = () => resolve(undefined);
          }),
      )
      .mockResolvedValueOnce(undefined);

    const first = harness.publicApi.submitTextTurn('First');
    const second = harness.publicApi.submitTextTurn('Second');

    await Promise.resolve();

    expect(harness.outboundGateway.submit).toHaveBeenCalledTimes(2);
    expect(harness.sendText).toHaveBeenNthCalledWith(1, 'First');
    expect(harness.sendText).toHaveBeenNthCalledWith(2, 'Second');

    resolveFirstSend();
    await Promise.all([first, second]);
  });

  it('blocks text only when the gateway explicitly blocks it', async () => {
    const harness = createHarness({
      gatewayDecision: {
        outcome: 'block',
        classification: 'non-replaceable',
        reason: 'breaker-open',
      },
    });

    await expect(harness.publicApi.submitTextTurn('Retry')).resolves.toBe(false);

    expect(harness.outboundGateway.submit).toHaveBeenCalledTimes(1);
    expect(harness.appendTypedUserTurn).not.toHaveBeenCalled();
    expect(harness.queueMixedModeAssistantReply).not.toHaveBeenCalled();
    expect(harness.sendText).not.toHaveBeenCalled();
    expect(harness.outboundGateway.recordSuccess).not.toHaveBeenCalled();
    expect(harness.outboundGateway.recordFailure).not.toHaveBeenCalled();
  });

  it('records session commands before dispatching text submission', async () => {
    const harness = createHarness();

    await harness.publicApi.submitTextTurn('Keep going');

    expect(harness.onCommand).toHaveBeenCalledWith({
      type: 'textTurn.submit',
      text: 'Keep going',
    });
  });
});

describe('createSessionControllerPublicApi – screen capture controls', () => {
  it('sets screenShareIntended to true when starting screen capture', async () => {
    const harness = createHarness();
    await harness.publicApi.startScreenCapture();
    expect(harness.refreshScreenCaptureSourceSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.setScreenShareIntended).toHaveBeenCalledWith(true);
    expect(harness.screenCtrl.start).toHaveBeenCalledTimes(1);
    expect(harness.refreshScreenCaptureSourceSnapshot.mock.invocationCallOrder[0]!).toBeLessThan(
      harness.screenCtrl.start.mock.invocationCallOrder[0]!,
    );
  });

  it('sets screenShareIntended to false when stopping screen capture', async () => {
    const harness = createHarness();
    await harness.publicApi.stopScreenCapture();
    expect(harness.setScreenShareIntended).toHaveBeenCalledWith(false);
    expect(harness.screenCtrl.stop).toHaveBeenCalledTimes(1);
  });

  it('does not start screen capture when the source snapshot refresh fails', async () => {
    const harness = createHarness({
      refreshScreenCaptureSourceSnapshotResult: false,
    });

    await harness.publicApi.startScreenCapture();

    expect(harness.refreshScreenCaptureSourceSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.setScreenShareIntended).not.toHaveBeenCalled();
    expect(harness.screenCtrl.start).not.toHaveBeenCalled();
  });

  it('does not expose legacy explicit streaming controls', () => {
    const harness = createHarness();

    expect('enableScreenStreaming' in harness.publicApi).toBe(false);
    expect('stopScreenStreaming' in harness.publicApi).toBe(false);
  });
});
