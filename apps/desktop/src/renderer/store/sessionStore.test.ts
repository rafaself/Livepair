import { beforeEach, describe, expect, it } from 'vitest';
import { LIVE_ADAPTER_KEY, selectAssistantRuntimeState } from '../runtime';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('defaults currentMode to inactive and lets it change independently from runtime diagnostics', () => {
    expect(useSessionStore.getState().activeChatId).toBeNull();
    expect(useSessionStore.getState().currentMode).toBe('inactive');
    expect(useSessionStore.getState().speechLifecycle.status).toBe('off');

    useSessionStore.getState().setCurrentMode('speech');
    useSessionStore.getState().setSpeechLifecycle({ status: 'starting' });
    useSessionStore.getState().setVoiceSessionStatus('ready');
    useSessionStore.getState().setTextSessionLifecycle({ status: 'receiving' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        speechLifecycle: expect.objectContaining({
          status: 'starting',
        }),
        voiceSessionStatus: 'ready',
        textSessionLifecycle: expect.objectContaining({
          status: 'receiving',
        }),
      }),
    );
  });

  it('tracks lifecycle state centrally and derives the UI assistant state from it', () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'receiving' });
    useSessionStore.getState().setAssistantActivity('listening');
    useSessionStore.getState().setBackendState('checking');
    useSessionStore.getState().setTokenRequestState('loading');
    useSessionStore.getState().setActiveTransport('gemini-live');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'receiving',
        }),
        assistantActivity: 'listening',
        backendState: 'checking',
        tokenRequestState: 'loading',
        activeTransport: 'gemini-live',
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('listening');
  });

  it('keeps sessionPhase and transportState derived from text lifecycle updates and reset overrides', () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'connecting' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'connecting',
        }),
        sessionPhase: 'starting',
        transportState: 'connecting',
      }),
    );

    useSessionStore.getState().setTextSessionLifecycle({ status: 'receiving' });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'receiving',
        }),
        sessionPhase: 'active',
        transportState: 'connected',
      }),
    );

    useSessionStore.getState().reset({
      textSessionLifecycle: { status: 'disconnecting' },
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'disconnecting',
        }),
        sessionPhase: 'ending',
        transportState: 'disconnecting',
      }),
    );
  });

  it('resets all runtime state back to its defaults', () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'error' });
    useSessionStore.getState().setAssistantActivity('speaking');
    useSessionStore.getState().setBackendState('failed');
    useSessionStore.getState().setTokenRequestState('success');
    useSessionStore.getState().setActiveTransport('gemini-live');
    useSessionStore.getState().setScreenCaptureState('streaming');
    useSessionStore.getState().setScreenCaptureDiagnostics({ frameCount: 10 });

    useSessionStore.getState().reset();

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        textSessionLifecycle: expect.objectContaining({
          status: 'idle',
        }),
        currentMode: 'inactive',
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        assistantActivity: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        activeTransport: null,
        conversationTurns: [],
        lastRuntimeError: null,
        voiceSessionResumption: {
          status: 'idle',
          latestHandle: null,
          resumable: false,
          lastDetail: null,
        },
        screenShareIntended: false,
        screenCaptureState: 'disabled',
        screenCaptureDiagnostics: {
          captureSource: null,
          frameCount: 0,
          frameRateHz: null,
          widthPx: null,
          heightPx: null,
          lastFrameAt: null,
          lastUploadStatus: 'idle',
          lastError: null,
        },
      }),
    );
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('disconnected');
  });

  it('tracks voice resumption and durability state separately', () => {
    useSessionStore.getState().setVoiceSessionResumption({
      status: 'reconnecting',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    useSessionStore.getState().setVoiceSessionDurability({
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      lastDetail: 'Refreshing token before resume',
    });

    expect(useSessionStore.getState().voiceSessionResumption).toEqual({
      status: 'reconnecting',
      latestHandle: 'handles/voice-session-2',
      resumable: true,
      lastDetail: 'server draining',
    });
    expect(useSessionStore.getState().voiceSessionDurability).toEqual({
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: true,
      tokenRefreshFailed: false,
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      lastDetail: 'Refreshing token before resume',
    });
  });

  it('tracks voice tool runtime state separately from the voice session lifecycle', () => {
    useSessionStore.getState().setVoiceToolState({
      status: 'toolExecuting',
      toolName: 'get_voice_session_status',
      callId: 'call-2',
      lastError: null,
    });

    expect(useSessionStore.getState().voiceToolState).toEqual({
      status: 'toolExecuting',
      toolName: 'get_voice_session_status',
      callId: 'call-2',
      lastError: null,
    });
  });

  it('tracks the speech lifecycle separately from low-level voice diagnostics', () => {
    useSessionStore.getState().setSpeechLifecycle({ status: 'assistantSpeaking' });
    useSessionStore.getState().setVoiceSessionStatus('streaming');
    useSessionStore.getState().setVoiceCaptureState('capturing');

    expect(useSessionStore.getState().speechLifecycle).toEqual({
      status: 'assistantSpeaking',
    });
    expect(useSessionStore.getState().voiceSessionStatus).toBe('streaming');
    expect(useSessionStore.getState().voiceCaptureState).toBe('capturing');
  });

  it('tracks realtime outbound diagnostics separately from other runtime slices', () => {
    expect(useSessionStore.getState().realtimeOutboundDiagnostics).toEqual({
      breakerState: 'closed',
      breakerReason: null,
      consecutiveFailureCount: 0,
      totalSubmitted: 0,
      sentCount: 0,
      droppedCount: 0,
      replacedCount: 0,
      blockedCount: 0,
      droppedByReason: {
        staleSequence: 0,
        laneSaturated: 0,
      },
      blockedByReason: {
        breakerOpen: 0,
      },
      submittedByKind: {
        text: 0,
        audioChunk: 0,
        visualFrame: 0,
      },
      lastDecision: null,
      lastReason: null,
      lastEventKind: null,
      lastChannelKey: null,
      lastSequence: null,
      lastReplaceKey: null,
      lastSubmittedAtMs: null,
      lastError: null,
    });

    useSessionStore.getState().setRealtimeOutboundDiagnostics({
      breakerState: 'open',
      breakerReason: 'transport unavailable',
      consecutiveFailureCount: 3,
      totalSubmitted: 9,
      sentCount: 4,
      droppedCount: 2,
      replacedCount: 1,
      blockedCount: 2,
      droppedByReason: {
        staleSequence: 1,
        laneSaturated: 1,
      },
      blockedByReason: {
        breakerOpen: 2,
      },
      submittedByKind: {
        text: 2,
        audioChunk: 4,
        visualFrame: 3,
      },
      lastDecision: 'block',
      lastReason: 'breaker-open',
      lastEventKind: 'text',
      lastChannelKey: 'text:speech-mode',
      lastSequence: 2,
      lastReplaceKey: null,
      lastSubmittedAtMs: 1_000,
      lastError: 'transport unavailable',
    });

    expect(useSessionStore.getState().realtimeOutboundDiagnostics).toEqual({
      breakerState: 'open',
      breakerReason: 'transport unavailable',
      consecutiveFailureCount: 3,
      totalSubmitted: 9,
      sentCount: 4,
      droppedCount: 2,
      replacedCount: 1,
      blockedCount: 2,
      droppedByReason: {
        staleSequence: 1,
        laneSaturated: 1,
      },
      blockedByReason: {
        breakerOpen: 2,
      },
      submittedByKind: {
        text: 2,
        audioChunk: 4,
        visualFrame: 3,
      },
      lastDecision: 'block',
      lastReason: 'breaker-open',
      lastEventKind: 'text',
      lastChannelKey: 'text:speech-mode',
      lastSequence: 2,
      lastReplaceKey: null,
      lastSubmittedAtMs: 1_000,
      lastError: 'transport unavailable',
    });
  });

  it('maps assistant runtime states with the live transport fallback and preserves currentMode', () => {
    useSessionStore.getState().setCurrentMode('speech');

    useSessionStore.getState().setAssistantState('thinking');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        assistantActivity: 'thinking',
        activeTransport: LIVE_ADAPTER_KEY,
        textSessionLifecycle: expect.objectContaining({
          status: 'connecting',
        }),
        sessionPhase: 'starting',
        transportState: 'connecting',
        lastRuntimeError: null,
      }),
    );

    useSessionStore.getState().setAssistantState('disconnected');

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        assistantActivity: 'idle',
        activeTransport: null,
        textSessionLifecycle: expect.objectContaining({
          status: 'idle',
        }),
        sessionPhase: 'idle',
        transportState: 'idle',
        lastRuntimeError: null,
      }),
    );
  });

  it('can reset runtime state while preserving conversation turns', () => {
    useSessionStore.getState().setActiveChatId('chat-1');
    useSessionStore.getState().appendConversationTurn({
      id: 'user-turn-1',
      role: 'user',
      content: 'Speech request',
      timestamp: '2026-03-12T00:00:00.000Z',
      state: 'complete',
      source: 'voice',
    });
    useSessionStore.getState().setSpeechLifecycle({ status: 'listening' });
    useSessionStore.getState().setVoiceSessionStatus('ready');

    useSessionStore.getState().resetTextSessionRuntime('disconnected', {
      preserveConversationTurns: true,
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        activeChatId: 'chat-1',
        textSessionLifecycle: expect.objectContaining({
          status: 'disconnected',
        }),
        speechLifecycle: expect.objectContaining({
          status: 'off',
        }),
        voiceSessionStatus: 'disconnected',
        conversationTurns: [
          expect.objectContaining({
            role: 'user',
            content: 'Speech request',
            source: 'voice',
          }),
        ],
      }),
    );
  });

  it('preserves settled transcript artifacts when preserveConversationTurns is true', () => {
    useSessionStore.getState().appendTranscriptArtifact({
      kind: 'transcript',
      id: 'assistant-transcript-1',
      role: 'assistant',
      content: 'Settled reply',
      timestamp: '2026-03-12T00:00:00.000Z',
      state: 'complete',
      source: 'voice',
    });
    useSessionStore.getState().appendTranscriptArtifact({
      kind: 'transcript',
      id: 'assistant-transcript-2',
      role: 'assistant',
      content: 'In-flight reply',
      timestamp: '2026-03-12T00:00:01.000Z',
      state: 'streaming',
      source: 'voice',
    });

    useSessionStore.getState().resetTextSessionRuntime('disconnected', {
      preserveConversationTurns: true,
    });

    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Settled reply',
        state: 'complete',
      }),
    ]);
  });

  it('clears all transcript artifacts when preserveConversationTurns is false', () => {
    useSessionStore.getState().appendTranscriptArtifact({
      kind: 'transcript',
      id: 'assistant-transcript-1',
      role: 'assistant',
      content: 'Settled reply',
      timestamp: '2026-03-12T00:00:00.000Z',
      state: 'complete',
      source: 'voice',
    });

    useSessionStore.getState().resetTextSessionRuntime('disconnected');

    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
  });

  it('can replace the visible conversation while keeping the active chat identity stable', () => {
    useSessionStore.getState().setActiveChatId('chat-7');
    useSessionStore.getState().appendConversationTurn({
      id: 'user-turn-1',
      role: 'user',
      content: 'Transient',
      timestamp: '2026-03-12T00:00:00.000Z',
      state: 'complete',
    });

    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'persisted-message-1',
        role: 'assistant',
        content: 'Restored',
        timestamp: '10:15',
        state: 'complete',
        persistedMessageId: 'message-1',
      },
    ]);

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        activeChatId: 'chat-7',
        conversationTurns: [
          expect.objectContaining({
            id: 'persisted-message-1',
            content: 'Restored',
            persistedMessageId: 'message-1',
          }),
        ],
      }),
    );
  });

  it('assigns and normalizes timeline ordinals across conversation turns and transcript artifacts', () => {
    useSessionStore.getState().appendConversationTurn({
      id: 'user-turn-1',
      role: 'user',
      content: 'First turn',
      timestamp: '2026-03-12T00:00:00.000Z',
      state: 'complete',
    });
    useSessionStore.getState().appendTranscriptArtifact({
      kind: 'transcript',
      id: 'assistant-transcript-1',
      role: 'assistant',
      content: 'Artifact reply',
      timestamp: '2026-03-12T00:00:01.000Z',
      state: 'complete',
      source: 'voice',
    });
    useSessionStore.getState().appendConversationTurn({
      id: 'assistant-turn-1',
      role: 'assistant',
      content: 'Second turn',
      timestamp: '2026-03-12T00:00:02.000Z',
      state: 'complete',
    });

    expect(
      useSessionStore.getState().conversationTurns.map((turn) => turn.timelineOrdinal),
    ).toEqual([1, 3]);
    expect(
      useSessionStore.getState().transcriptArtifacts.map((artifact) => artifact.timelineOrdinal),
    ).toEqual([2]);

    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'persisted-message-1',
        role: 'assistant',
        content: 'Restored first',
        timestamp: '10:15',
        state: 'complete',
        timelineOrdinal: 5,
      },
      {
        id: 'persisted-message-2',
        role: 'user',
        content: 'Restored second',
        timestamp: '10:16',
        state: 'complete',
      },
    ]);

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'persisted-message-1',
        timelineOrdinal: 5,
      }),
      expect.objectContaining({
        id: 'persisted-message-2',
        timelineOrdinal: 6,
      }),
    ]);
  });

  describe('screen capture slice', () => {
    it('initialises screen capture state to disabled with zero diagnostics', () => {
      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
      expect(useSessionStore.getState().screenCaptureDiagnostics).toEqual({
        captureSource: null,
        frameCount: 0,
        frameRateHz: null,
        widthPx: null,
        heightPx: null,
        lastFrameAt: null,
        lastUploadStatus: 'idle',
        lastError: null,
      });
    });

    it('updates screenCaptureState through the dedicated setter', () => {
      useSessionStore.getState().setScreenCaptureState('ready');
      expect(useSessionStore.getState().screenCaptureState).toBe('ready');

      useSessionStore.getState().setScreenCaptureState('capturing');
      expect(useSessionStore.getState().screenCaptureState).toBe('capturing');

      useSessionStore.getState().setScreenCaptureState('streaming');
      expect(useSessionStore.getState().screenCaptureState).toBe('streaming');

      useSessionStore.getState().setScreenCaptureState('error');
      expect(useSessionStore.getState().screenCaptureState).toBe('error');

      useSessionStore.getState().setScreenCaptureState('disabled');
      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
    });

    it('updates screenShareIntended through the dedicated setter', () => {
      expect(useSessionStore.getState().screenShareIntended).toBe(false);

      useSessionStore.getState().setScreenShareIntended(true);
      expect(useSessionStore.getState().screenShareIntended).toBe(true);

      useSessionStore.getState().setScreenShareIntended(false);
      expect(useSessionStore.getState().screenShareIntended).toBe(false);
    });

    it('patches screenCaptureDiagnostics without clobbering unrelated fields', () => {
      useSessionStore.getState().setScreenCaptureDiagnostics({
        captureSource: 'Entire screen',
        frameCount: 5,
        frameRateHz: 1,
        lastUploadStatus: 'sending',
      });
      useSessionStore.getState().setScreenCaptureDiagnostics({
        widthPx: 640,
        heightPx: 360,
        lastFrameAt: '2026-03-10T00:00:00.000Z',
      });

      expect(useSessionStore.getState().screenCaptureDiagnostics).toEqual({
        captureSource: 'Entire screen',
        frameCount: 5,
        frameRateHz: 1,
        widthPx: 640,
        heightPx: 360,
        lastFrameAt: '2026-03-10T00:00:00.000Z',
        lastUploadStatus: 'sending',
        lastError: null,
      });
    });

    it('stores source snapshots and clears them during runtime resets', () => {
      useSessionStore.getState().setScreenCaptureSourceSnapshot({
        sources: [
          { id: 'screen:1:0', name: 'Entire Screen' },
          { id: 'window:42:0', name: 'VSCode' },
        ],
        selectedSourceId: 'window:42:0',
      });

      expect(useSessionStore.getState().screenCaptureSources).toEqual([
        { id: 'screen:1:0', name: 'Entire Screen' },
        { id: 'window:42:0', name: 'VSCode' },
      ]);
      expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBe('window:42:0');

      useSessionStore.getState().resetTextSessionRuntime();
      expect(useSessionStore.getState().screenCaptureSources).toEqual([]);
      expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBeNull();

      useSessionStore.getState().setScreenCaptureSourceSnapshot({
        sources: [{ id: 'screen:1:0', name: 'Entire Screen' }],
        selectedSourceId: 'screen:1:0',
      });
      useSessionStore.getState().reset();

      expect(useSessionStore.getState().screenCaptureSources).toEqual([]);
      expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBeNull();
    });

    it('resets screen capture to disabled on reset()', () => {
      useSessionStore.getState().setScreenCaptureState('capturing');
      useSessionStore.getState().setScreenCaptureDiagnostics({
        frameCount: 10,
        lastError: 'oops',
      });

      useSessionStore.getState().reset();

      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
      expect(useSessionStore.getState().screenCaptureDiagnostics).toEqual({
        captureSource: null,
        frameCount: 0,
        frameRateHz: null,
        widthPx: null,
        heightPx: null,
        lastFrameAt: null,
        lastUploadStatus: 'idle',
        lastError: null,
      });
    });

    it('resets screen capture to disabled on resetTextSessionRuntime()', () => {
      useSessionStore.getState().setScreenCaptureState('capturing');
      useSessionStore.getState().setScreenCaptureDiagnostics({ frameCount: 7 });

      useSessionStore.getState().resetTextSessionRuntime();

      expect(useSessionStore.getState().screenCaptureState).toBe('disabled');
      expect(useSessionStore.getState().screenCaptureDiagnostics.frameCount).toBe(0);
    });

    it('resets screenShareIntended to false on resetTextSessionRuntime()', () => {
      useSessionStore.getState().setScreenShareIntended(true);
      useSessionStore.getState().resetTextSessionRuntime();
      expect(useSessionStore.getState().screenShareIntended).toBe(false);
    });
  });

  describe('localUserSpeechActive', () => {
    it('defaults to false', () => {
      expect(useSessionStore.getState().localUserSpeechActive).toBe(false);
    });

    it('setLocalUserSpeechActive updates the value', () => {
      useSessionStore.getState().setLocalUserSpeechActive(true);
      expect(useSessionStore.getState().localUserSpeechActive).toBe(true);

      useSessionStore.getState().setLocalUserSpeechActive(false);
      expect(useSessionStore.getState().localUserSpeechActive).toBe(false);
    });

    it('resets to false on reset()', () => {
      useSessionStore.getState().setLocalUserSpeechActive(true);
      useSessionStore.getState().reset();
      expect(useSessionStore.getState().localUserSpeechActive).toBe(false);
    });

    it('resets to false on resetTextSessionRuntime()', () => {
      useSessionStore.getState().setLocalUserSpeechActive(true);
      useSessionStore.getState().resetTextSessionRuntime();
      expect(useSessionStore.getState().localUserSpeechActive).toBe(false);
    });
  });
});
