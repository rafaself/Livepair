import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerRuntime } from './sessionRuntime';

function createHarness() {
  const logger = {
    onSessionEvent: vi.fn(),
  };
  const stateSync = {
    applyEngineEventTransition: vi.fn(),
    applySpeechLifecycleEvent: vi.fn(),
    applyVoiceTranscriptUpdate: vi.fn(),
    clearCurrentVoiceTranscript: vi.fn(),
    currentProductMode: vi.fn(() => 'inactive'),
    currentSpeechLifecycleStatus: vi.fn(() => 'off'),
    currentVoiceSessionStatus: vi.fn(() => 'disconnected'),
    getVoicePlayback: vi.fn(),
    resetVoiceSessionDurability: vi.fn(),
    resetVoiceSessionResumption: vi.fn(),
    resetVoiceToolState: vi.fn(),
    resetVoiceTurnTranscriptState: vi.fn(),
    setCurrentMode: vi.fn(),
    setVoicePlaybackState: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionStatus: vi.fn(),
    setVoiceToolState: vi.fn(),
    syncSpeechSilenceTimeout: vi.fn(),
    syncVoiceDurabilityState: vi.fn(),
    updateVoicePlaybackDiagnostics: vi.fn(),
  };
  const storeState = {
    speechLifecycle: { status: 'off' },
    voiceSessionStatus: 'disconnected',
    setLastDebugEvent: vi.fn(),
  };

  const runtime = createSessionControllerRuntime({
    logger,
    store: {
      getState: vi.fn(() => storeState),
    } as never,
    mutableRuntime: {
      beginSessionOperation: vi.fn(),
      clearTransportSubscription: vi.fn(),
      getActiveTransport: vi.fn(),
      getRealtimeOutboundGateway: vi.fn(),
      getVoiceResumptionInFlight: vi.fn(),
      isCurrentSessionOperation: vi.fn(),
      resetRealtimeOutboundGateway: vi.fn(),
      setActiveTransport: vi.fn(),
      subscribeTransport: vi.fn(),
      setVoiceResumptionInFlight: vi.fn(),
    } as never,
    stateSync: stateSync as never,
    playbackCtrl: {
      isActive: vi.fn(),
      release: vi.fn(),
      stop: vi.fn(),
    } as never,
    voiceChunkCtrl: {
      flush: vi.fn(),
      resetSendChain: vi.fn(),
    } as never,
    voiceToolCtrl: {
      cancel: vi.fn(),
      enqueue: vi.fn(),
    } as never,
    screenCtrl: {
      handleTransportDetached: vi.fn(),
      stopCapture: vi.fn(),
    } as never,
    interruptionCtrl: {
      handle: vi.fn(),
      reset: vi.fn(),
    } as never,
    currentTextSessionStatus: () => 'idle',
    resetTextSessionRuntime: vi.fn(),
    clearPendingAssistantTurn: vi.fn(),
    voiceTranscript: {
      resetTurnTranscriptState: vi.fn(),
      resetTurnCompletedFlag: vi.fn(),
    },
    silenceCtrl: {
      clearAll: vi.fn(),
    },
  });

  return { runtime, logger, stateSync };
}

describe('createSessionControllerRuntime', () => {
  it('maps normalized session events to speech lifecycle transitions before logging them', () => {
    const { runtime, logger, stateSync } = createHarness();

    runtime.recordSessionEvent({ type: 'turn.assistant.output.started' });

    expect(stateSync.applyEngineEventTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: 'turn.assistant.output.started' },
        speechLifecycleEvent: { type: 'assistant.output.started' },
        nextState: expect.objectContaining({
          speechLifecycle: { status: 'off' },
        }),
      }),
    );
    expect(logger.onSessionEvent).toHaveBeenCalledWith({
      type: 'turn.assistant.output.started',
    });
  });

  it('leaves transcript observation events out of lifecycle reduction', () => {
    const { runtime, stateSync } = createHarness();

    runtime.recordSessionEvent({
      type: 'transcript.assistant.updated',
      text: 'hello',
      isFinal: false,
    });

    expect(stateSync.applyEngineEventTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        speechLifecycleEvent: null,
      }),
    );
  });
});
