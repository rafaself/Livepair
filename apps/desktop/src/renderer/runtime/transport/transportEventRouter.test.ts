import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransportEventRouter } from './transportEventRouter';
import { configureRuntimeDebugMode } from '../core/debugMode';
import { useUiStore } from '../../store/uiStore';
import { resetDesktopStores } from '../../test/store';
import type { VoiceTranscriptUpdateResult } from '../voice/voice.types';

function createVoiceSessionLatencyState() {
  return {
    connect: {
      status: 'available' as const,
      valueMs: 45,
      lastValueMs: 45,
      startedAtMs: null,
    },
    firstModelResponse: {
      status: 'available' as const,
      valueMs: 60,
      lastValueMs: 60,
      startedAtMs: null,
    },
    speechToFirstModelResponse: {
      status: 'available' as const,
      valueMs: 35,
      lastValueMs: 35,
      startedAtMs: null,
    },
  };
}

function createMockOps() {
  const storeState = {
    setLastDebugEvent: vi.fn(),
    setAssistantActivity: vi.fn(),
    setActiveTransport: vi.fn(),
    setLastRuntimeError: vi.fn(),
    setVoiceSessionLatency: vi.fn(),
    setVoiceTranscriptDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      storeState.voiceTranscriptDiagnostics = {
        ...storeState.voiceTranscriptDiagnostics,
        ...patch,
      };
    }),
    setIgnoredAssistantOutputDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      storeState.ignoredAssistantOutputDiagnostics = {
        ...storeState.ignoredAssistantOutputDiagnostics,
        ...patch,
      };
    }),
    setVoiceSessionRecoveryDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      storeState.voiceSessionRecoveryDiagnostics = {
        ...storeState.voiceSessionRecoveryDiagnostics,
        ...patch,
      };
    }),
    voiceSessionResumption: { status: 'idle', latestHandle: null as string | null, resumable: false, lastDetail: null as string | null },
    voiceSessionDurability: { lastDetail: null as string | null },
    voiceSessionLatency: createVoiceSessionLatencyState(),
    voiceTranscriptDiagnostics: {
      inputTranscriptCount: 0,
      lastInputTranscriptAt: null,
      outputTranscriptCount: 0,
      lastOutputTranscriptAt: null,
      assistantTextFallbackCount: 0,
      lastAssistantTextFallbackAt: null,
      lastAssistantTextFallbackReason: null,
    },
    ignoredAssistantOutputDiagnostics: {
      totalCount: 0,
      countsByEventType: {
        textDelta: 0,
        outputTranscript: 0,
        audioChunk: 0,
        turnComplete: 0,
      },
      countsByReason: {
        turnUnavailable: 0,
        lifecycleFence: 0,
        noOpenTurnFence: 0,
      },
      lastIgnoredAt: null,
      lastIgnoredReason: null,
      lastIgnoredEventType: null,
      lastIgnoredVoiceSessionStatus: null,
    },
    voiceSessionRecoveryDiagnostics: {
      transitionCount: 0,
      lastTransition: null,
      lastTransitionAt: null,
      lastRecoveryDetail: null,
      lastTurnResetReason: null,
      lastTurnResetAt: null,
    },
    voiceLiveSignalDiagnostics: {
      inputAudioTranscriptionEnabled: false,
      outputAudioTranscriptionEnabled: false,
      responseModality: 'AUDIO',
      sessionResumptionEnabled: false,
      inputTranscriptCount: 0,
      lastInputTranscriptAt: null,
      outputTranscriptCount: 0,
      lastOutputTranscriptAt: null,
      assistantTextFallbackCount: 0,
      lastAssistantTextFallbackAt: null,
      ignoredOutputTotalCount: 0,
      ignoredTextDeltaCount: 0,
      ignoredOutputTranscriptCount: 0,
      ignoredAudioChunkCount: 0,
      ignoredTurnCompleteCount: 0,
      lastIgnoredReason: null,
      lastIgnoredEventType: null,
      lastIgnoredVoiceStatus: null,
    },
    screenShareIntended: false,
    screenCaptureState: 'disabled' as string,
  };
  const ops = {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    settingsStore: {
      getState: vi.fn().mockReturnValue({
        settings: { selectedOutputDeviceId: 'default' },
      }),
    } as never,
    logger: {
      onTransportEvent: vi.fn(),
      onSessionEvent: vi.fn(),
    },
    recordSessionEvent: vi.fn(),
    logRuntimeDiagnostic: vi.fn(),
    isVoiceResumptionInFlight: vi.fn().mockReturnValue(false),
    setVoiceResumptionInFlight: vi.fn(),
    currentVoiceSessionStatus: vi.fn().mockReturnValue('active'),
    currentSpeechLifecycleStatus: vi.fn().mockReturnValue('listening'),
    getToken: vi.fn().mockReturnValue({
      token: 'tok',
      expireTime: '2099-01-01T00:00:00.000Z',
      newSessionExpireTime: '2099-01-01T00:00:00.000Z',
    }),
    setVoiceSessionStatus: vi.fn(),
    setVoiceSessionResumption: vi.fn(),
    setVoiceSessionDurability: vi.fn(),
    persistLiveSessionResumption: vi.fn(),
    syncVoiceDurabilityState: vi.fn(),
    setVoicePlaybackState: vi.fn(),
    updateVoicePlaybackDiagnostics: vi.fn(),
    getVoicePlayback: vi.fn().mockReturnValue({
      enqueue: vi.fn().mockResolvedValue(undefined),
    }),
    stopVoicePlayback: vi.fn().mockResolvedValue(undefined),
    cancelVoiceToolCalls: vi.fn(),
    resetVoiceToolState: vi.fn(),
    resetVoiceTurnTranscriptState: vi.fn(),
    ensureAssistantVoiceTurn: vi.fn().mockReturnValue(true),
    finalizeCurrentVoiceTurns: vi.fn(),
    attachCurrentAssistantTurn: vi.fn(),
    enqueueVoiceToolCalls: vi.fn(),
    handleVoiceInterruption: vi.fn(),
    applyVoiceTranscriptUpdate: vi
      .fn<(role: 'user' | 'assistant', text: string, isFinal?: boolean) => VoiceTranscriptUpdateResult>()
      .mockReturnValue({
        role: 'user',
        classification: 'same-turn-update',
        didUpdate: true,
      }),
    appendAssistantDraftTextDelta: vi.fn(),
    setAssistantAnswerMetadata: vi.fn(),
    completeAssistantDraft: vi.fn(),
    interruptAssistantDraft: vi.fn(),
    discardAssistantDraft: vi.fn(),
    commitAssistantDraft: vi.fn().mockReturnValue(null),
    hasOpenVoiceTurnFence: vi.fn().mockReturnValue(true),
    hasPendingVoiceToolCall: vi.fn().mockReturnValue(false),
    hasActiveAssistantVoiceTurn: vi.fn().mockReturnValue(false),
    hasQueuedMixedModeAssistantReply: vi.fn().mockReturnValue(false),
    hasStreamingAssistantVoiceTurn: vi.fn().mockReturnValue(false),
    shouldIgnoreAssistantOutput: vi.fn(),
    deriveTurnCompleteEvent: vi.fn(),
    setVoiceErrorState: vi.fn(),
    cleanupTransport: vi.fn(),
    resumeVoiceSession: vi.fn().mockResolvedValue(undefined),
    restoreScreenCapture: vi.fn(),
    updateVoiceLiveSignalDiagnostics: vi.fn((patch: Record<string, unknown>) => {
      storeState.voiceLiveSignalDiagnostics = {
        ...storeState.voiceLiveSignalDiagnostics,
        ...patch,
      };
    }),
    getActiveLiveCapabilities: vi.fn().mockReturnValue({
      inputAudioTranscriptionEnabled: true,
      outputAudioTranscriptionEnabled: true,
      responseModality: 'AUDIO',
      sessionResumptionEnabled: true,
    }),
    _storeState: storeState,
  };

  ops.shouldIgnoreAssistantOutput.mockImplementation(
    (eventType: string, options: Record<string, boolean>) => {
      const voiceStatus = ops.currentVoiceSessionStatus();
      const unavailable =
        voiceStatus === 'interrupted' || voiceStatus === 'recovering' || voiceStatus === 'stopping';

      if (!unavailable) {
        return { ignore: false };
      }

      const canContinueUnavailableTurn =
        eventType === 'turn-complete'
          ? options['hasStreamingAssistantVoiceTurn']
          : options['hasQueuedMixedModeAssistantReply'] || options['hasStreamingAssistantVoiceTurn'];

      return canContinueUnavailableTurn
        ? { ignore: false }
        : { ignore: true, reason: 'turn-unavailable' as const };
    },
  );
  ops.deriveTurnCompleteEvent.mockImplementation(() => {
    const speechLifecycleStatus = ops.currentSpeechLifecycleStatus();

    if (speechLifecycleStatus === 'assistantSpeaking') {
      return { type: 'turn.assistantCompleted' as const };
    }

    if (speechLifecycleStatus === 'userSpeaking') {
      return { type: 'turn.user.settled' as const };
    }

    return null;
  });

  return ops;
}

describe('createTransportEventRouter', () => {
  beforeEach(() => {
    resetDesktopStores();
    configureRuntimeDebugMode(() => useUiStore.getState().isDebugMode);
  });

  describe('connection-state-changed', () => {
    it('sets connecting status on connecting state', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connecting' });

      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transport.connecting',
        resuming: false,
      });
      expect(ops.setVoiceSessionStatus).not.toHaveBeenCalled();
    });

    it('sets recovering on connecting when resumption is in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connecting' });

      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transport.connecting',
        resuming: true,
      });
    });

    it('resets live signal diagnostics on fresh voice-session connect', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connecting' });

      expect(ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTranscriptCount: 0,
          outputTranscriptCount: 0,
          assistantTextFallbackCount: 0,
          ignoredOutputTotalCount: 0,
        }),
      );
    });

    it('initializes all subsystems on connected', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transport.connected',
        resumed: false,
      });
      expect(ops.setVoiceSessionStatus).not.toHaveBeenCalled();
      expect(ops.resetVoiceToolState).toHaveBeenCalledTimes(1);
      expect(ops._storeState.setAssistantActivity).toHaveBeenCalledWith('idle');
      expect(ops._storeState.setActiveTransport).toHaveBeenCalledWith('gemini-live');
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith(null);
      expect(ops.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
      expect(ops.setVoiceResumptionInFlight).toHaveBeenCalledWith(false);
      expect(ops.setVoicePlaybackState).toHaveBeenCalledWith('idle');
    });

    it('sets resumption status to connected on fresh connection', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'connected' }),
      );
    });

    it('sets resumption status to resumed when resumption was in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'resumed' }),
      );
    });

    it('preserves the existing live-signal capability snapshot across resumed connects', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.updateVoiceLiveSignalDiagnostics).not.toHaveBeenCalledWith(
        expect.objectContaining({
          inputAudioTranscriptionEnabled: true,
          outputAudioTranscriptionEnabled: true,
          responseModality: 'AUDIO',
          sessionResumptionEnabled: true,
        }),
      );
    });

    it('initializes playback diagnostics with settings output device on connected', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.updateVoicePlaybackDiagnostics).toHaveBeenCalledWith({
        chunkCount: 0,
        queueDepth: 0,
        sampleRateHz: null,
        lastError: null,
        selectedOutputDeviceId: 'default',
      });
    });

    it('snapshots live session capabilities into signal diagnostics on connected', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.updateVoiceLiveSignalDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({
          inputAudioTranscriptionEnabled: true,
          outputAudioTranscriptionEnabled: true,
          responseModality: 'AUDIO',
          sessionResumptionEnabled: true,
        }),
      );
    });

    it('skips capability snapshot when getActiveLiveCapabilities returns null', () => {
      const ops = createMockOps();
      ops.getActiveLiveCapabilities.mockReturnValue(null);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.updateVoiceLiveSignalDiagnostics).not.toHaveBeenCalledWith(
        expect.objectContaining({ inputAudioTranscriptionEnabled: expect.anything() }),
      );
    });

    it('sets recovering on disconnected when resumption is in flight', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'disconnected' });

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'transport.disconnected',
      });
      expect(ops.cleanupTransport).not.toHaveBeenCalled();
    });

    it('cleans up on disconnected when no resumption is in flight', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'disconnected' });

      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transport.disconnected',
      });
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('voice transport disconnected');
      expect(ops.resetVoiceTurnTranscriptState).toHaveBeenCalledTimes(1);
      expect(ops.resetVoiceToolState).toHaveBeenCalledTimes(1);
      expect(ops.stopVoicePlayback).toHaveBeenCalledTimes(1);
      expect(ops.cleanupTransport).toHaveBeenCalledTimes(1);
      expect(ops._storeState.setAssistantActivity).toHaveBeenCalledWith('idle');
      expect(ops._storeState.setActiveTransport).toHaveBeenCalledWith(null);
    });

    it('restores screen capture on connected when intent is set and capture is disabled', () => {
      const ops = createMockOps();
      ops._storeState.screenShareIntended = true;
      ops._storeState.screenCaptureState = 'disabled';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.restoreScreenCapture).toHaveBeenCalledTimes(1);
    });

    it('does not restore screen capture on connected when intent is false', () => {
      const ops = createMockOps();
      ops._storeState.screenShareIntended = false;
      ops._storeState.screenCaptureState = 'disabled';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.restoreScreenCapture).not.toHaveBeenCalled();
    });

    it('does not restore screen capture when capture is already active', () => {
      const ops = createMockOps();
      ops._storeState.screenShareIntended = true;
      ops._storeState.screenCaptureState = 'capturing';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.restoreScreenCapture).not.toHaveBeenCalled();
    });

    it('restores screen capture after resume reconnect when intent is set', () => {
      const ops = createMockOps();
      ops.isVoiceResumptionInFlight.mockReturnValue(true);
      ops._storeState.screenShareIntended = true;
      ops._storeState.screenCaptureState = 'disabled';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-state-changed', state: 'connected' });

      expect(ops.restoreScreenCapture).toHaveBeenCalledTimes(1);
      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'resumed' }),
      );
    });
  });

  describe('go-away', () => {
    it('sets resumption to goAway and triggers resume', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away', detail: 'server draining' });

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith({
        status: 'goAway',
        lastDetail: 'server draining',
      });
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('server draining');
      expect(ops.setVoiceSessionDurability).toHaveBeenCalledWith(
        expect.objectContaining({ lastDetail: 'server draining' }),
      );
      expect(ops.resumeVoiceSession).toHaveBeenCalledWith('server draining');
    });

    it('demotes latency diagnostics to unavailable last values before resuming', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away', detail: 'server draining' });

      expect(ops._storeState.setVoiceSessionLatency).toHaveBeenCalledWith({
        connect: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 45,
          startedAtMs: null,
        },
        firstModelResponse: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 60,
          startedAtMs: null,
        },
        speechToFirstModelResponse: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 35,
          startedAtMs: null,
        },
      });
    });

    it('uses fallback detail when none provided', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away' } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({ lastDetail: 'Voice session unavailable' }),
      );
    });

    it('ignores go-away while the voice session is already stopping', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('stopping');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'go-away', detail: 'server draining' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
      expect(ops.setVoiceSessionResumption).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'goAway' }),
      );
    });
  });

  describe('connection-terminated', () => {
    it('triggers resume when voice session is active', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('active');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'transport recycled' });

      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('transport recycled');
      expect(ops.resumeVoiceSession).toHaveBeenCalledWith('transport recycled');
    });

    it('demotes latency diagnostics to unavailable last values before reconnecting', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('active');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'transport recycled' });

      expect(ops._storeState.setVoiceSessionLatency).toHaveBeenCalledWith({
        connect: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 45,
          startedAtMs: null,
        },
        firstModelResponse: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 60,
          startedAtMs: null,
        },
        speechToFirstModelResponse: {
          status: 'unavailable',
          valueMs: null,
          lastValueMs: 35,
          startedAtMs: null,
        },
      });
    });

    it('no-ops when voice session is stopping', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('stopping');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });

    it('no-ops when voice session is disconnected', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('disconnected');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });

    it('no-ops when voice session is in error', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('error');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'connection-terminated', detail: 'recycled' });

      expect(ops.resumeVoiceSession).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('delegates to setVoiceErrorState', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'error', detail: 'transport failed' });

      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('transport failed');
      expect(ops.setVoiceErrorState).toHaveBeenCalledWith('transport failed');
    });
  });

  describe('session-resumption-update', () => {
    it('updates resumption with handle and resumable flag', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({
        type: 'session-resumption-update',
        handle: 'handles/v2',
        resumable: true,
      } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({
          latestHandle: 'handles/v2',
          resumable: true,
        }),
      );
      expect(ops.persistLiveSessionResumption).toHaveBeenCalledWith({
        resumptionHandle: 'handles/v2',
        lastResumptionUpdateAt: expect.any(String),
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      });
    });

    it('clears the latest handle when the transport explicitly reports no resumable handle', () => {
      const ops = createMockOps();
      ops._storeState.voiceSessionResumption.latestHandle = 'handles/existing';
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({
        type: 'session-resumption-update',
        handle: null,
        resumable: false,
      } as never);

      expect(ops.setVoiceSessionResumption).toHaveBeenCalledWith(
        expect.objectContaining({
          latestHandle: null,
          resumable: false,
          lastDetail: null,
        }),
      );
      expect(ops.persistLiveSessionResumption).toHaveBeenCalledWith({
        resumptionHandle: null,
        lastResumptionUpdateAt: expect.any(String),
        restorable: false,
        invalidatedAt: expect.any(String),
        invalidationReason: null,
      });
    });
  });

  describe('audio-error', () => {
    it('updates playback diagnostics, sets runtime error, and stops playback with error state', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-error', detail: 'malformed audio' });

      expect(ops.updateVoicePlaybackDiagnostics).toHaveBeenCalledWith({ lastError: 'malformed audio' });
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith('malformed audio');
      expect(ops.stopVoicePlayback).toHaveBeenCalledWith('error');
    });
  });

  describe('interrupted', () => {
    it('marks turn completed and delegates to interruption handler', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });

      expect(ops.interruptAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.discardAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.cancelVoiceToolCalls).toHaveBeenCalledWith('voice turn interrupted');
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('interrupted');
      expect(ops.handleVoiceInterruption).toHaveBeenCalledTimes(1);
    });

    it('ignores duplicate interrupted events after the current turn is already fenced', () => {
      const ops = createMockOps();
      ops.hasOpenVoiceTurnFence
        .mockReturnValueOnce(true)
        .mockReturnValue(false);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });
      handleTransportEvent({ type: 'interrupted' });

      expect(ops.interruptAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.discardAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledTimes(1);
      expect(ops.handleVoiceInterruption).toHaveBeenCalledTimes(1);
    });

    it('ignores late assistant text deltas while the interrupted turn is unavailable', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'late text' });

      expect(ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          eventType: 'text-delta',
        }),
      );
    });

    it('allows assistant text deltas for a queued mixed-mode reply while recovery is settling', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      ops.hasQueuedMixedModeAssistantReply.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'next reply' });

      expect(ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('next reply');
      expect(ops.logRuntimeDiagnostic).not.toHaveBeenCalled();
    });

    it('ignores assistant transcript packets after interruption fences the turn', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'output-transcript', text: 'late transcript', isFinal: false } as never);

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistant.output.started',
      });
      expect(ops.ensureAssistantVoiceTurn).not.toHaveBeenCalled();
      expect(ops.applyVoiceTranscriptUpdate).not.toHaveBeenCalled();
      expect(ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
    });

    it('ignores late assistant audio chunks while no interrupted or queued assistant turn can accept them', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      const chunk = new Uint8Array([9, 9, 9]);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-chunk', chunk });

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistant.output.started',
      });
      expect(ops.ensureAssistantVoiceTurn).not.toHaveBeenCalled();
      expect(ops.getVoicePlayback().enqueue).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'recovering',
          eventType: 'audio-chunk',
        }),
      );
    });

  });

  describe('text-delta', () => {
    it('routes streamed assistant text into the transient assistant draft only', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'text-delta', text: 'Hello' });

      expect(ops.appendAssistantDraftTextDelta).toHaveBeenCalledWith('Hello');
      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalled();
    });
  });

  describe('input-transcript', () => {
    it('fires user speech lifecycle event and updates transcript', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'input-transcript', text: 'hello', isFinal: true } as never);

      expect(ops.recordSessionEvent).toHaveBeenNthCalledWith(1, {
        type: 'turn.user.speech.detected',
      });
      expect(ops.recordSessionEvent).toHaveBeenNthCalledWith(2, {
        type: 'transcript.user.updated',
        text: 'hello',
        isFinal: true,
      });
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('user', 'hello', true);
    });

    it('keeps transcript observation but does not re-emit user speech detected for a settled replay', () => {
      const ops = createMockOps();
      ops.applyVoiceTranscriptUpdate.mockReturnValue({
        role: 'user',
        classification: 'settled-replay',
        didUpdate: false,
      });
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'input-transcript', text: 'same phrase', isFinal: false } as never);

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.user.speech.detected',
      });
      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transcript.user.updated',
        text: 'same phrase',
        isFinal: false,
      });
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('user', 'same phrase', false);
    });

    it('keeps transcript observation but does not re-emit user speech detected for a settled correction', () => {
      const ops = createMockOps();
      ops.applyVoiceTranscriptUpdate.mockReturnValue({
        role: 'user',
        classification: 'settled-correction',
        didUpdate: true,
      });
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'input-transcript', text: 'same phrase corrected', isFinal: true } as never);

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.user.speech.detected',
      });
      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transcript.user.updated',
        text: 'same phrase corrected',
        isFinal: true,
      });
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('user', 'same phrase corrected', true);
    });
  });

  describe('output-transcript', () => {
    it('fires assistant output lifecycle event and updates transcript', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'output-transcript', text: 'hi there', isFinal: false } as never);

      expect(ops.recordSessionEvent).toHaveBeenNthCalledWith(1, {
        type: 'turn.assistant.output.started',
      });
      expect(ops.recordSessionEvent).toHaveBeenNthCalledWith(2, {
        type: 'transcript.assistant.updated',
        text: 'hi there',
        isFinal: false,
      });
      expect(ops.ensureAssistantVoiceTurn).toHaveBeenCalledTimes(1);
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('assistant', 'hi there', false);
    });

    it('does not re-emit assistant output started when a turn is already streaming', () => {
      const ops = createMockOps();
      ops.hasStreamingAssistantVoiceTurn.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'output-transcript', text: 'still hi', isFinal: false } as never);

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistant.output.started',
      });
      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'transcript.assistant.updated',
        text: 'still hi',
        isFinal: false,
      });
      expect(ops.applyVoiceTranscriptUpdate).toHaveBeenCalledWith('assistant', 'still hi', false);
    });
  });

  describe('audio-chunk', () => {
    it('fires assistant output lifecycle event and enqueues chunk', () => {
      const ops = createMockOps();
      const chunk = new Uint8Array([1, 2, 3]);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-chunk', chunk });

      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'turn.assistant.output.started',
      });
      expect(ops.ensureAssistantVoiceTurn).toHaveBeenCalledTimes(1);
      expect(ops.getVoicePlayback().enqueue).toHaveBeenCalledWith(chunk);
    });

    it('does not re-emit assistant output started for subsequent audio chunks of the same turn', () => {
      const ops = createMockOps();
      ops.hasStreamingAssistantVoiceTurn.mockReturnValue(true);
      const chunk = new Uint8Array([4, 5, 6]);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'audio-chunk', chunk });

      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistant.output.started',
      });
      expect(ops.getVoicePlayback().enqueue).toHaveBeenCalledWith(chunk);
    });
  });

  describe('generation-complete', () => {
    it('does not finalize voice turns, draft ownership, or advance the speech lifecycle on its own', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'generation-complete' });

      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalled();
      expect(ops.recordSessionEvent).not.toHaveBeenCalled();
    });
  });

  describe('turn-complete', () => {
    it('finalizes and commits the assistant draft only when turn-complete arrives', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.commitAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.attachCurrentAssistantTurn).toHaveBeenCalledWith(null);
    });

    it('ignores turn-complete when there is no open fenced turn to finalize', () => {
      const ops = createMockOps();
      ops.hasOpenVoiceTurnFence.mockReturnValue(false);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
      expect(ops.attachCurrentAssistantTurn).not.toHaveBeenCalled();
    });

    it('ignores late turn-complete after interruption so interrupted drafts cannot commit normally', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalledWith('completed');
      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistantCompleted',
      });
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored assistant output while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          eventType: 'turn-complete',
        }),
      );
    });

    it('allows turn-complete once a new assistant turn is actively streaming during recovery', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      ops.hasStreamingAssistantVoiceTurn.mockReturnValue(true);
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.completeAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.commitAssistantDraft).toHaveBeenCalledTimes(1);
      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.attachCurrentAssistantTurn).toHaveBeenCalledWith(null);
    });
  });

  describe('tool-call', () => {
    it('enqueues tool calls', () => {
      const ops = createMockOps();
      const calls = [{ name: 'get_current_mode', id: 'c1', args: {} }];
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'tool-call', calls } as never);

      expect(ops.enqueueVoiceToolCalls).toHaveBeenCalledWith(calls);
    });

    it('ignores tool calls while the voice session is unavailable', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const calls = [{ name: 'get_current_mode', id: 'c1', args: {} }];
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'tool-call', calls } as never);

      expect(ops.enqueueVoiceToolCalls).not.toHaveBeenCalled();
      expect(ops.logRuntimeDiagnostic).toHaveBeenCalledWith(
        'voice-session',
        'ignored tool call while turn is unavailable',
        expect.objectContaining({
          voiceStatus: 'interrupted',
          callCount: 1,
        }),
      );
    });
  });

  describe('answer-metadata', () => {
    it('applies execution-derived answer metadata without changing the turn flow', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({
        type: 'answer-metadata',
        answerMetadata: {
          provenance: 'web_grounded',
          confidence: 'high',
          citations: [{ label: 'Release notes', uri: 'https://example.com/releases' }],
          reason: 'Derived from Gemini Live grounding metadata with web support.',
        },
      });

      expect(ops.setAssistantAnswerMetadata).toHaveBeenCalledWith({
        provenance: 'web_grounded',
        confidence: 'high',
        citations: [{ label: 'Release notes', uri: 'https://example.com/releases' }],
        reason: 'Derived from Gemini Live grounding metadata with web support.',
      });
      expect(ops.appendAssistantDraftTextDelta).not.toHaveBeenCalled();
      expect(ops.commitAssistantDraft).not.toHaveBeenCalled();
    });
  });

  describe('turn-complete', () => {
    it('marks turn completed and fires assistant.turn.completed when assistant is speaking', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('assistantSpeaking');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.attachCurrentAssistantTurn).toHaveBeenCalledWith(null);
      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'turn.assistantCompleted',
      });
    });

    it('marks turn completed and fires user.turn.settled when user is speaking', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('userSpeaking');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.attachCurrentAssistantTurn).toHaveBeenCalledWith(null);
      expect(ops.recordSessionEvent).toHaveBeenCalledWith({
        type: 'turn.user.settled',
      });
    });

    it('marks turn completed without lifecycle event in other states', () => {
      const ops = createMockOps();
      ops.currentSpeechLifecycleStatus.mockReturnValue('listening');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).toHaveBeenCalledWith('completed');
      expect(ops.attachCurrentAssistantTurn).toHaveBeenCalledWith(null);
      expect(ops.recordSessionEvent).not.toHaveBeenCalled();
    });

    it('does not treat a post-interruption turn-complete as a normal assistant completion transition', () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('interrupted');
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'turn-complete' });

      expect(ops.finalizeCurrentVoiceTurns).not.toHaveBeenCalledWith('completed');
      expect(ops.recordSessionEvent).not.toHaveBeenCalledWith({
        type: 'turn.assistantCompleted',
      });
    });
  });

  describe('logging and debug events', () => {
    it('logs every transport event without publishing a debug event when debug mode is off', () => {
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });

      expect(ops.logger.onTransportEvent).toHaveBeenCalledWith({ type: 'interrupted' });
      expect(ops._storeState.setLastDebugEvent).not.toHaveBeenCalled();
    });

    it('publishes debug events when debug mode is enabled', () => {
      useUiStore.setState({ isDebugMode: true });
      const ops = createMockOps();
      const { handleTransportEvent } = createTransportEventRouter(ops as never);

      handleTransportEvent({ type: 'interrupted' });

      expect(ops._storeState.setLastDebugEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'transport',
          type: 'interrupted',
        }),
      );
    });
  });
});
