import { beforeEach, describe, expect, it } from 'vitest';
import { selectAssistantRuntimeState } from '../runtime/selectors';
import { useSessionStore } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('defaults currentMode to text and lets it change independently from runtime diagnostics', () => {
    expect(useSessionStore.getState().currentMode).toBe('text');
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
        currentMode: 'text',
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

  it('can reset runtime state while preserving conversation turns', () => {
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
  });
});
