import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import {
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
  useSessionRuntime,
} from '../../../runtime/liveRuntime';
import { useSettingsStore } from '../../../store/settingsStore';
import { resetDesktopStores } from '../../../test/store';
import { useUiStore } from '../../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';

vi.mock('../../../runtime/liveRuntime', async () => {
  const actual = await vi.importActual<typeof import('../../../runtime/liveRuntime')>('../../../runtime/liveRuntime');
  return {
    ...actual,
    useSessionRuntime: vi.fn(),
  };
});

type SessionRuntime = ReturnType<typeof useSessionRuntime>;

function createRuntime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  const currentMode = overrides.currentMode ?? 'inactive';
  const speechLifecycleStatus = overrides.speechLifecycleStatus ?? 'off';
  const activeTransport = overrides.activeTransport ?? null;
  const voiceSessionStatus = overrides.voiceSessionStatus ?? 'disconnected';
  const voiceCaptureState = overrides.voiceCaptureState ?? 'inactive';
  const screenCaptureState = overrides.screenCaptureState ?? 'disabled';
  const textSessionStatus = overrides.textSessionStatus ?? 'idle';

  const controlGatingSnapshot = overrides.snapshot?.controlGatingSnapshot ?? createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
  });

  return {
    snapshot: {
      assistantState: overrides.assistantState ?? 'ready',
      currentMode,
      activeTransport,
      isSpeechMode: currentMode === 'speech',
      backendState: overrides.backendState ?? 'connected',
      backendIndicatorState: overrides.backendIndicatorState ?? 'ready',
      backendLabel: overrides.backendLabel ?? 'Connected',
      tokenRequestState: overrides.tokenRequestState ?? 'idle',
      tokenFeedback: overrides.tokenFeedback ?? null,
      textSessionStatus,
      textSessionStatusLabel: overrides.textSessionStatusLabel ?? 'Idle',
      canSubmitText: overrides.canSubmitText ?? true,
      lastRuntimeError: overrides.lastRuntimeError ?? null,
      isSessionActive: overrides.isSessionActive ?? false,
      liveSessionPhaseLabel: overrides.snapshot?.liveSessionPhaseLabel ?? null,
      speechLifecycleStatus,
      voiceSessionStatus,
      voiceSessionResumptionStatus: overrides.voiceSessionResumptionStatus ?? 'idle',
      voiceCaptureState,
      screenCaptureState,
      isVoiceSessionActive: overrides.isVoiceSessionActive ?? false,
      controlGatingSnapshot,
      composerSpeechActionKind:
        overrides.snapshot?.composerSpeechActionKind ?? getComposerSpeechActionKind(controlGatingSnapshot),
      localUserSpeechActive: overrides.localUserSpeechActive ?? false,
    },
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
    lastRuntimeError: null,
    isSessionActive: false,
    isVoiceSessionActive: false,
    speechLifecycleStatus: 'off',
    voiceSessionStatus: 'disconnected',
    voiceCaptureState: 'inactive',
    screenCaptureState: 'disabled',
    handleCheckBackendHealth: vi.fn(async () => undefined),
    handleStartVoiceSession: vi.fn(async () => undefined),
    handleStartVoiceCapture: vi.fn(async () => undefined),
    handleStopVoiceCapture: vi.fn(async () => undefined),
    handleStartScreenCapture: vi.fn(async () => undefined),
    handleStopScreenCapture: vi.fn(async () => undefined),
    handleSendScreenNow: vi.fn(),
    handleSubmitTextTurn: vi.fn(async () => false),
    handleEndSpeechMode: vi.fn(async () => undefined),
    handleEndSession: vi.fn(async () => undefined),
    setAssistantState: vi.fn(),
    ...overrides,
  } as SessionRuntime;
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
    const handleStartVoiceCapture = vi.fn(async () => undefined);
    const handleStopVoiceCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        handleStartVoiceSession,
        handleStartVoiceCapture,
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
    expect(handleStartVoiceCapture).not.toHaveBeenCalled();
    expect(handleStopVoiceCapture).not.toHaveBeenCalled();
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
        voiceSessionStatus: 'active',
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
        voiceSessionStatus: 'active',
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
    const handleStartVoiceCapture = vi.fn(async () => undefined);
    const handleStartScreenCapture = vi.fn(async () => undefined);
    const handleStopVoiceCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        handleStartVoiceSession,
        handleStartVoiceCapture,
        handleStartScreenCapture,
        handleStopVoiceCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(handleStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(handleStartScreenCapture).toHaveBeenCalledTimes(1);
    expect(handleStartVoiceCapture).not.toHaveBeenCalled();
    expect(handleStopVoiceCapture).not.toHaveBeenCalled();
  });

  it('gates starting a Live session with screen sharing until Share Screen mode is configured', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleStartVoiceCapture = vi.fn(async () => undefined);
    const handleStartScreenCapture = vi.fn(async () => undefined);
    let pendingStartAction: (() => Promise<void>) | null = null;
    const screenShareModeGate = vi.fn(async (action: () => Promise<void>) => {
      pendingStartAction = action;
    });
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        handleStartVoiceSession,
        handleStartVoiceCapture,
        handleStartScreenCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController({ screenShareModeGate }));

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(screenShareModeGate).toHaveBeenCalledTimes(1);
    expect(handleStartVoiceSession).not.toHaveBeenCalled();
    expect(handleStartScreenCapture).not.toHaveBeenCalled();
    expect(handleStartVoiceCapture).not.toHaveBeenCalled();
    expect(pendingStartAction).not.toBeNull();

    await act(async () => {
      await pendingStartAction?.();
    });

    expect(handleStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(handleStartScreenCapture).toHaveBeenCalledTimes(1);
    expect(handleStartVoiceCapture).not.toHaveBeenCalled();
  });

  it('submits trimmed text and only clears the draft after a successful send', async () => {
    const handleSubmitTextTurn = vi
      .fn<(draftText: string) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
        currentMode: 'speech',
        activeTransport: 'gemini-live',
        isSpeechMode: true,
        isSessionActive: true,
        isVoiceSessionActive: true,
        speechLifecycleStatus: 'listening',
        voiceSessionStatus: 'active',
        voiceCaptureState: 'capturing',
        handleSubmitTextTurn,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    act(() => {
      result.current.handleDraftTextChange({
        currentTarget: { value: '  successful send  ' },
      } as ChangeEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      await result.current.handleSubmitTextTurn({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
    });

    expect(handleSubmitTextTurn).toHaveBeenCalledWith('successful send');
    expect(result.current.draftText).toBe('');

    act(() => {
      result.current.handleDraftTextChange({
        currentTarget: { value: '  keep draft  ' },
      } as ChangeEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      await result.current.handleSubmitTextTurn({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
    });

    expect(handleSubmitTextTurn).toHaveBeenLastCalledWith('keep draft');
    expect(result.current.draftText).toBe('  keep draft  ');
  });

  it('starts screen sharing before microphone capture when toggled from an inactive composer', async () => {
    const handleStartVoiceSession = vi.fn(async () => undefined);
    const handleStartVoiceCapture = vi.fn(async () => undefined);
    const handleStartScreenCapture = vi.fn(async () => undefined);
    mockUseSessionRuntime.mockReturnValue(
      createRuntime({
      handleStartVoiceSession,
      handleStartVoiceCapture,
      handleStartScreenCapture,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(handleStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(handleStartScreenCapture).toHaveBeenCalledTimes(1);
    expect(handleStartVoiceCapture).not.toHaveBeenCalled();
    expect(handleStartVoiceSession.mock.invocationCallOrder[0]).toBeLessThan(
      handleStartScreenCapture.mock.invocationCallOrder[0]!,
    );
  });
});
