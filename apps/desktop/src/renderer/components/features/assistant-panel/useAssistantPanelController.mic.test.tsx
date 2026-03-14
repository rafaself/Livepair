import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import { useSessionRuntime } from '../../../runtime';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSessionStore } from '../../../store/sessionStore';
import { resetDesktopStores } from '../../../store/testing';
import { useUiStore } from '../../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';

vi.mock('../../../runtime', async () => {
  const actual = await vi.importActual<typeof import('../../../runtime')>('../../../runtime');
  return {
    ...actual,
    useSessionRuntime: vi.fn(),
  };
});

type SessionRuntime = ReturnType<typeof useSessionRuntime>;

function createRuntime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  const sessionState = useSessionStore.getState();

  return {
    assistantState: 'ready',
    currentMode: 'inactive',
    activeTransport: null,
    isSpeechMode: false,
    backendState: 'connected',
    backendIndicatorState: 'ready',
    backendLabel: 'Connected',
    tokenRequestState: 'idle',
    tokenFeedback: null,
    textSessionStatus: 'idle',
    textSessionStatusLabel: 'Idle',
    canSubmitText: true,
    conversationTurns: [],
    lastRuntimeError: null,
    isConversationEmpty: true,
    isSessionActive: false,
    isVoiceSessionActive: false,
    speechLifecycleStatus: 'off',
    voiceSessionStatus: 'disconnected',
    voiceSessionResumption: {
      status: 'idle',
      latestHandle: null,
      resumable: false,
      lastDetail: null,
    },
    voiceSessionDurability: {
      compressionEnabled: true,
      tokenValid: false,
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: null,
      newSessionExpireTime: null,
      lastDetail: null,
    },
    voiceCaptureState: 'idle',
    voiceCaptureDiagnostics: sessionState.voiceCaptureDiagnostics,
    voicePlaybackState: 'idle',
    voicePlaybackDiagnostics: sessionState.voicePlaybackDiagnostics,
    voiceToolState: sessionState.voiceToolState,
    realtimeOutboundDiagnostics: sessionState.realtimeOutboundDiagnostics,
    screenCaptureState: 'disabled',
    screenCaptureDiagnostics: sessionState.screenCaptureDiagnostics,
    visualSendDiagnostics: sessionState.visualSendDiagnostics,
    handleCheckBackendHealth: vi.fn(async () => undefined),
    handleStartVoiceSession: vi.fn(async () => undefined),
    handleStartVoiceCapture: vi.fn(async () => undefined),
    handleStopVoiceCapture: vi.fn(async () => undefined),
    handleStartScreenCapture: vi.fn(async () => undefined),
    handleStopScreenCapture: vi.fn(async () => undefined),
    handleAnalyzeScreenNow: vi.fn(),
    handleSubmitTextTurn: vi.fn(async () => false),
    handleEndSpeechMode: vi.fn(async () => undefined),
    handleEndSession: vi.fn(async () => undefined),
    setAssistantState: vi.fn(),
    ...overrides,
  };
}

describe('useAssistantPanelController – composer media controls', () => {
  const mockUseSessionRuntime = vi.mocked(useSessionRuntime);

  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    vi.clearAllMocks();
  });

  it('stores the microphone preference for the next session and applies it after speech mode starts', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleStopVoiceCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        handleStartVoiceSession,
        handleStopVoiceCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    expect(result.current.isComposerMicrophoneEnabled).toBe(true);

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);
    expect(result.current.isComposerMicrophoneEnabled).toBe(false);

    await act(async () => {
      await result.current.handleStartSpeechMode();
    });

    expect(handleStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(handleStopVoiceCapture).toHaveBeenCalledTimes(1);
  });

  it('toggles active-session microphone capture without ending or restarting the session', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);
    const handleStopVoiceCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        currentMode: 'speech',
        activeTransport: 'gemini-live',
        isSpeechMode: true,
        isSessionActive: true,
        isVoiceSessionActive: true,
        speechLifecycleStatus: 'listening',
        voiceSessionStatus: 'ready',
        voiceCaptureState: 'capturing',
        handleStartVoiceSession,
        handleEndSpeechMode,
        handleStopVoiceCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);
    expect(handleStopVoiceCapture).toHaveBeenCalledTimes(1);
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
    expect(handleStartVoiceSession).not.toHaveBeenCalled();
  });

  it('starts screen capture during an active Live session without restarting the session', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleStartScreenCapture = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        currentMode: 'speech',
        activeTransport: 'gemini-live',
        isSpeechMode: true,
        isSessionActive: true,
        isVoiceSessionActive: true,
        speechLifecycleStatus: 'listening',
        voiceSessionStatus: 'ready',
        screenCaptureState: 'disabled',
        handleStartVoiceSession,
        handleStartScreenCapture,
        handleEndSpeechMode,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(handleStartScreenCapture).toHaveBeenCalledTimes(1);
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
    expect(handleStartVoiceSession).not.toHaveBeenCalled();
  });

  it('starts a Live session with screen sharing when toggled from an inactive composer', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleStopVoiceCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        handleStartVoiceSession,
        handleStopVoiceCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(handleStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(handleStopVoiceCapture).not.toHaveBeenCalled();
  });
});
