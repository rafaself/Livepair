import { describe, expect, it, vi } from 'vitest';
import { createSessionControllerStateSync } from './sessionStateSync';

type VoiceLatencyMetricTestState = {
  status: 'available' | 'pending' | 'unavailable';
  valueMs: number | null;
  lastValueMs: number | null;
  startedAtMs: number | null;
};

type VoiceSessionLatencyTestState = {
  connect: VoiceLatencyMetricTestState;
  firstModelResponse: VoiceLatencyMetricTestState;
  speechToFirstModelResponse: VoiceLatencyMetricTestState;
};

function createVoiceSessionLatencyState(
  overrides: Partial<VoiceSessionLatencyTestState> = {},
): VoiceSessionLatencyTestState {
  return {
    connect: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
    firstModelResponse: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
    speechToFirstModelResponse: {
      status: 'unavailable',
      valueMs: null,
      lastValueMs: null,
      startedAtMs: null,
    },
    ...overrides,
  };
}

function createMockArgs(speechStatus = 'off', mode = 'text') {
  const storeState = {
    speechLifecycle: { status: speechStatus },
    voiceSessionStatus: 'disconnected',
    voiceSessionLatency: createVoiceSessionLatencyState(),
    currentMode: mode,
    textSessionLifecycle: { status: 'idle' },
    voiceCaptureState: 'idle',
    voicePlaybackState: 'idle',
    setSpeechLifecycle: vi.fn((speechLifecycle) => {
      storeState.speechLifecycle = speechLifecycle;
    }),
    setVoiceSessionStatus: vi.fn((voiceSessionStatus) => {
      storeState.voiceSessionStatus = voiceSessionStatus;
    }),
    setVoiceSessionLatency: vi.fn((voiceSessionLatency) => {
      storeState.voiceSessionLatency = voiceSessionLatency;
    }),
    setCurrentMode: vi.fn((currentMode) => {
      storeState.currentMode = currentMode;
    }),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
  };

  return {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    settingsStore: {
      getState: vi.fn().mockReturnValue({
        settings: { selectedOutputDeviceId: 'speakers' },
      }),
    } as never,
    onSpeechLifecycleTransition: vi.fn(),
    handleSpeechLifecycleStatusChange: vi.fn(),
    updateVoicePlaybackDiagnostics: vi.fn(),
    setVoicePlaybackState: vi.fn(),
    getVoicePlayback: vi.fn(),
    setVoiceToolState: vi.fn(),
    resetVoiceToolState: vi.fn(),
    clearCurrentVoiceTranscript: vi.fn(),
    resetVoiceTurnTranscriptState: vi.fn(),
    applyVoiceTranscriptUpdate: vi.fn(),
    syncVoiceDurabilityState: vi.fn(),
    getNowMs: vi.fn(() => 0),
    _storeState: storeState,
  };
}

describe('createSessionControllerStateSync', () => {
  describe('applySpeechLifecycleEvent', () => {
    it('updates store and fires callbacks when status changes', () => {
      const args = createMockArgs('off');
      const sync = createSessionControllerStateSync(args as never);

      const result = sync.applySpeechLifecycleEvent({ type: 'session.start.requested' });

      expect(result).toBe('starting');
      expect(args._storeState.setSpeechLifecycle).toHaveBeenCalledWith({ status: 'starting' });
      expect(args.onSpeechLifecycleTransition).toHaveBeenCalledWith('off', 'starting', 'session.start.requested');
      expect(args.handleSpeechLifecycleStatusChange).toHaveBeenCalledWith('starting');
    });

    it('does not fire callbacks when status stays the same', () => {
      const args = createMockArgs('listening');
      const sync = createSessionControllerStateSync(args as never);

      // session.start.requested from 'listening' is a no-op
      const result = sync.applySpeechLifecycleEvent({ type: 'session.start.requested' });

      expect(result).toBe('listening');
      expect(args._storeState.setSpeechLifecycle).not.toHaveBeenCalled();
      expect(args.onSpeechLifecycleTransition).not.toHaveBeenCalled();
    });

    it('tracks connect, first-response, and speech-to-response latency from lifecycle events', () => {
      const args = createMockArgs('off');
      args.getNowMs = vi
        .fn()
        .mockReturnValueOnce(1_000)
        .mockReturnValueOnce(1_450)
        .mockReturnValueOnce(1_900)
        .mockReturnValueOnce(2_050);
      const sync = createSessionControllerStateSync(args as never);

      sync.applySpeechLifecycleEvent({ type: 'session.start.requested' });
      sync.applySpeechLifecycleEvent({ type: 'session.ready' });
      sync.applySpeechLifecycleEvent({ type: 'user.speech.detected' });
      sync.applySpeechLifecycleEvent({ type: 'assistant.output.started' });

      expect(args._storeState.setVoiceSessionLatency).toHaveBeenNthCalledWith(
        1,
        createVoiceSessionLatencyState({
          connect: {
            status: 'pending',
            valueMs: null,
            lastValueMs: null,
            startedAtMs: 1_000,
          },
        }),
      );
      expect(args._storeState.setVoiceSessionLatency).toHaveBeenNthCalledWith(
        2,
        createVoiceSessionLatencyState({
          connect: {
            status: 'available',
            valueMs: 450,
            lastValueMs: 450,
            startedAtMs: null,
          },
          firstModelResponse: {
            status: 'pending',
            valueMs: null,
            lastValueMs: null,
            startedAtMs: 1_450,
          },
        }),
      );
      expect(args._storeState.setVoiceSessionLatency).toHaveBeenNthCalledWith(
        3,
        createVoiceSessionLatencyState({
          connect: {
            status: 'available',
            valueMs: 450,
            lastValueMs: 450,
            startedAtMs: null,
          },
          firstModelResponse: {
            status: 'pending',
            valueMs: null,
            lastValueMs: null,
            startedAtMs: 1_450,
          },
          speechToFirstModelResponse: {
            status: 'pending',
            valueMs: null,
            lastValueMs: null,
            startedAtMs: 1_900,
          },
        }),
      );
      expect(args._storeState.setVoiceSessionLatency).toHaveBeenNthCalledWith(
        4,
        createVoiceSessionLatencyState({
          connect: {
            status: 'available',
            valueMs: 450,
            lastValueMs: 450,
            startedAtMs: null,
          },
          firstModelResponse: {
            status: 'available',
            valueMs: 600,
            lastValueMs: 600,
            startedAtMs: null,
          },
          speechToFirstModelResponse: {
            status: 'available',
            valueMs: 150,
            lastValueMs: 150,
            startedAtMs: null,
          },
        }),
      );
    });

    it('marks pending latency values unavailable on session end while preserving last completed values', () => {
      const args = createMockArgs('assistantSpeaking');
      args._storeState.voiceSessionLatency = createVoiceSessionLatencyState({
        connect: {
          status: 'available',
          valueMs: 420,
          lastValueMs: 420,
          startedAtMs: null,
        },
        firstModelResponse: {
          status: 'pending',
          valueMs: null,
          lastValueMs: 310,
          startedAtMs: 2_000,
        },
        speechToFirstModelResponse: {
          status: 'pending',
          valueMs: null,
          lastValueMs: 180,
          startedAtMs: 2_100,
        },
      });
      const sync = createSessionControllerStateSync(args as never);

      sync.applySpeechLifecycleEvent({ type: 'session.end.requested' });

      expect(args._storeState.setVoiceSessionLatency).toHaveBeenCalledWith(
        createVoiceSessionLatencyState({
          connect: {
            status: 'available',
            valueMs: 420,
            lastValueMs: 420,
            startedAtMs: null,
          },
          firstModelResponse: {
            status: 'unavailable',
            valueMs: null,
            lastValueMs: 310,
            startedAtMs: null,
          },
          speechToFirstModelResponse: {
            status: 'unavailable',
            valueMs: null,
            lastValueMs: 180,
            startedAtMs: null,
          },
        }),
      );
    });
  });

  describe('currentSpeechLifecycleStatus', () => {
    it('reads status from store', () => {
      const args = createMockArgs('listening');
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.currentSpeechLifecycleStatus()).toBe('listening');
    });
  });

  describe('currentVoiceSessionStatus', () => {
    it('reads voice session status from store', () => {
      const args = createMockArgs();
      args._storeState.voiceSessionStatus = 'ready';
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.currentVoiceSessionStatus()).toBe('ready');
    });
  });

  describe('currentProductMode and setCurrentMode', () => {
    it('reads and writes current mode', () => {
      const args = createMockArgs('off', 'speech');
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.currentProductMode()).toBe('speech');

      sync.setCurrentMode('inactive');
      expect(args._storeState.setCurrentMode).toHaveBeenCalledWith('inactive');
    });
  });

  describe('hasSpeechLifecycleActivity', () => {
    it('returns false when speech is off', () => {
      const args = createMockArgs('off');
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.hasSpeechLifecycleActivity()).toBe(false);
    });

    it('returns true when speech is active', () => {
      const args = createMockArgs('listening');
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.hasSpeechLifecycleActivity()).toBe(true);
    });
  });

  describe('createVoiceToolExecutionSnapshot', () => {
    it('captures all state dimensions', () => {
      const args = createMockArgs('listening', 'speech');
      args._storeState.voiceSessionStatus = 'ready';
      args._storeState.voiceCaptureState = 'capturing';
      args._storeState.voicePlaybackState = 'playing';
      args._storeState.textSessionLifecycle = { status: 'idle' };
      const sync = createSessionControllerStateSync(args as never);

      const snapshot = sync.createVoiceToolExecutionSnapshot();

      expect(snapshot).toEqual({
        currentMode: 'speech',
        textSessionStatus: 'idle',
        speechLifecycleStatus: 'listening',
        voiceSessionStatus: 'ready',
        voiceCaptureState: 'capturing',
        voicePlaybackState: 'playing',
      });
    });
  });

  describe('resetVoiceRuntimeState', () => {
    it('resets tool state, transcript, and turn state', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      sync.resetVoiceRuntimeState();

      expect(args.resetVoiceToolState).toHaveBeenCalledTimes(1);
      expect(args.clearCurrentVoiceTranscript).toHaveBeenCalledTimes(1);
      expect(args.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetVoiceSessionResumption', () => {
    it('resets resumption to default state', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      sync.resetVoiceSessionResumption();

      expect(args._storeState.setVoiceSessionResumption).toHaveBeenCalledWith({
        status: 'idle',
        latestHandle: null,
        resumable: false,
        lastDetail: null,
      });
    });
  });

  describe('resetVoiceSessionDurability', () => {
    it('resets durability to default state', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      sync.resetVoiceSessionDurability();

      expect(args._storeState.setVoiceSessionDurability).toHaveBeenCalledWith({
        compressionEnabled: false,
        tokenValid: false,
        tokenRefreshing: false,
        tokenRefreshFailed: false,
        expireTime: null,
        newSessionExpireTime: null,
        lastDetail: null,
      });
    });
  });

  describe('selectedOutputDeviceId', () => {
    it('reads from settings store', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      expect(sync.selectedOutputDeviceId()).toBe('speakers');
    });
  });

  describe('pass-through methods', () => {
    it('delegates setVoiceSessionStatus to store', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      sync.setVoiceSessionStatus('ready');

      expect(args._storeState.setVoiceSessionStatus).toHaveBeenCalledWith('ready');
    });

    it('delegates syncSpeechSilenceTimeout to handler', () => {
      const args = createMockArgs();
      const sync = createSessionControllerStateSync(args as never);

      sync.syncSpeechSilenceTimeout('listening');

      expect(args.handleSpeechLifecycleStatusChange).toHaveBeenCalledWith('listening');
    });
  });
});
