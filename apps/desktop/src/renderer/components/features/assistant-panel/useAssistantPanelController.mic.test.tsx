import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import {
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
} from '../../../runtime/liveRuntime';
import { useDomainRuntimeHost } from '../../../runtime/domainRuntimeContract';
import { useSettingsStore } from '../../../store/settingsStore';
import { resetDesktopStores } from '../../../test/store';
import { useUiStore } from '../../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';

vi.mock('../../../runtime/domainRuntimeContract', async () => {
  const actual = await vi.importActual<typeof import('../../../runtime/domainRuntimeContract')>('../../../runtime/domainRuntimeContract');
  return {
    ...actual,
    useDomainRuntimeHost: vi.fn(),
  };
});

type DomainRuntimeHost = ReturnType<typeof useDomainRuntimeHost>;
type DomainRuntimeHostOverrides = Omit<Partial<DomainRuntimeHost>, 'snapshot'> & {
  snapshot?: Partial<DomainRuntimeHost['snapshot']>;
};

function createHost(overrides: DomainRuntimeHostOverrides = {}): DomainRuntimeHost {
  const currentMode = overrides.snapshot?.currentMode ?? 'inactive';
  const speechLifecycleStatus = overrides.snapshot?.speechLifecycleStatus ?? 'off';
  const voiceCaptureState = overrides.snapshot?.voiceCaptureState ?? 'inactive';
  const screenCaptureState = overrides.snapshot?.screenCaptureState ?? 'disabled';
  const textSessionStatus = overrides.snapshot?.textSessionStatus ?? 'idle';
  const canToggleContextSharing = overrides.snapshot?.canToggleContextSharing ?? true;
  const isContextSharingActive = overrides.snapshot?.isContextSharingActive ?? false;

  const controlGatingSnapshot = overrides.snapshot?.controlGatingSnapshot ?? createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    textSessionStatus,
    activeTransport: currentMode === 'speech' ? 'gemini-live' : null,
    voiceSessionStatus: currentMode === 'speech' ? 'active' : 'disconnected',
    voiceCaptureState,
    screenCaptureState,
  });

  return {
    snapshot: {
      assistantState: overrides.snapshot?.assistantState ?? 'ready',
      backendState: overrides.snapshot?.backendState ?? 'connected',
      backendIndicatorState: overrides.snapshot?.backendIndicatorState ?? 'ready',
      backendLabel: overrides.snapshot?.backendLabel ?? 'Connected',
      currentMode,
      tokenRequestState: overrides.snapshot?.tokenRequestState ?? 'idle',
      tokenFeedback: overrides.snapshot?.tokenFeedback ?? null,
      textSessionStatus,
      textSessionStatusLabel: overrides.snapshot?.textSessionStatusLabel ?? 'Idle',
      canSubmitText: overrides.snapshot?.canSubmitText ?? true,
      canSubmitComposerText: overrides.snapshot?.canSubmitComposerText ?? true,
      lastRuntimeError: overrides.snapshot?.lastRuntimeError ?? null,
      isSessionActive: overrides.snapshot?.isSessionActive ?? currentMode === 'speech',
      isVoiceSessionActive:
        overrides.snapshot?.isVoiceSessionActive
          ?? (currentMode === 'speech' || speechLifecycleStatus !== 'off'),
      liveSessionPhaseLabel: overrides.snapshot?.liveSessionPhaseLabel ?? null,
      speechLifecycleStatus,
      sessionRecoveryStatus: overrides.snapshot?.sessionRecoveryStatus ?? 'idle',
      canEndSpeechMode: overrides.snapshot?.canEndSpeechMode ?? currentMode === 'speech',
      sessionActionKind:
        overrides.snapshot?.sessionActionKind ?? getComposerSpeechActionKind(controlGatingSnapshot),
      localUserSpeechActive: overrides.snapshot?.localUserSpeechActive ?? false,
      canToggleContextSharing,
      isContextSharingActive,
      contextState: overrides.snapshot?.contextState ?? (isContextSharingActive ? 'active' : 'inactive'),
      controlGatingSnapshot,
      voiceCaptureState,
      screenCaptureState,
    },
    checkBackendHealth: vi.fn(async () => undefined),
    startSpeechMode: vi.fn(async () => true),
    startSpeechModeWithContext: vi.fn(async () => true),
    startVoiceCapture: vi.fn(async () => undefined),
    stopVoiceCapture: vi.fn(async () => undefined),
    startScreenCapture: vi.fn(async () => undefined),
    stopScreenCapture: vi.fn(async () => undefined),
    submitTextTurn: vi.fn(async () => false),
    setInputEnabled: vi.fn(async () => undefined),
    setContextSharingEnabled: vi.fn(async () => undefined),
    sendContextNow: vi.fn(),
    requestEndSpeechMode: vi.fn(async () => true),
    refreshScreenCaptureSources: vi.fn(async () => true),
    selectScreenCaptureSource: vi.fn(async () => true),
    setSaveScreenFramesEnabled: vi.fn(),
    reportRuntimeError: vi.fn(),
    setAssistantState: vi.fn(),
    ...overrides,
  } as DomainRuntimeHost;
}

describe('useAssistantPanelController – composer media controls', () => {
  const mockUseDomainRuntimeHost = vi.mocked(useDomainRuntimeHost);

  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    vi.clearAllMocks();
  });

  it('stores the microphone preference for the next session and applies it after speech mode starts', async () => {
    const startSpeechMode = vi.fn(async () => true);
    const setInputEnabled = vi.fn(async () => undefined);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        startSpeechMode,
        setInputEnabled,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    expect(result.current.isComposerMicrophoneEnabled).toBe(true);

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);
    expect(result.current.isComposerMicrophoneEnabled).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(false);

    await act(async () => {
      await result.current.handleStartSpeechMode();
    });

    expect(startSpeechMode).toHaveBeenCalledTimes(1);
  });

  it('toggles active-session microphone capture without ending or restarting the session', async () => {
    const startSpeechMode = vi.fn(async () => true);
    const requestEndSpeechMode = vi.fn(async () => true);
    const setInputEnabled = vi.fn(async () => undefined);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        snapshot: {
          currentMode: 'speech',
          isSessionActive: true,
          speechLifecycleStatus: 'listening',
          voiceCaptureState: 'capturing',
        },
        startSpeechMode,
        requestEndSpeechMode,
        setInputEnabled,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);
    expect(setInputEnabled).toHaveBeenCalledWith(false);
    expect(requestEndSpeechMode).not.toHaveBeenCalled();
    expect(startSpeechMode).not.toHaveBeenCalled();
  });

  it('starts screen capture during an active Live session without restarting the session', async () => {
    const startSpeechMode = vi.fn(async () => true);
    const requestEndSpeechMode = vi.fn(async () => true);
    const setContextSharingEnabled = vi.fn(async () => undefined);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        snapshot: {
          currentMode: 'speech',
          isSessionActive: true,
          speechLifecycleStatus: 'listening',
          screenCaptureState: 'disabled',
          canToggleContextSharing: true,
          isContextSharingActive: false,
        },
        startSpeechMode,
        requestEndSpeechMode,
        setContextSharingEnabled,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(setContextSharingEnabled).toHaveBeenCalledWith(true);
    expect(requestEndSpeechMode).not.toHaveBeenCalled();
    expect(startSpeechMode).not.toHaveBeenCalled();
  });

  it('starts a Live session with screen sharing when toggled from an inactive composer', async () => {
    const startSpeechModeWithContext = vi.fn(async () => true);
    const setInputEnabled = vi.fn(async () => undefined);
    const setContextSharingEnabled = vi.fn(async () => undefined);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        startSpeechModeWithContext,
        setInputEnabled,
        setContextSharingEnabled,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(startSpeechModeWithContext).toHaveBeenCalledTimes(1);
    expect(setContextSharingEnabled).not.toHaveBeenCalled();
    expect(setInputEnabled).not.toHaveBeenCalled();
  });

  it('gates starting a Live session with screen sharing until Share Screen mode is configured', async () => {
    const startSpeechModeWithContext = vi.fn(async () => true);
    let pendingStartAction: (() => Promise<void>) | null = null;
    const screenShareModeGate = vi.fn(async (action: () => Promise<void>) => {
      pendingStartAction = action;
    });
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        startSpeechModeWithContext,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController({ screenShareModeGate }));

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(screenShareModeGate).toHaveBeenCalledTimes(1);
    expect(startSpeechModeWithContext).not.toHaveBeenCalled();
    expect(pendingStartAction).not.toBeNull();

    await act(async () => {
      await pendingStartAction?.();
    });

    expect(startSpeechModeWithContext).toHaveBeenCalledTimes(1);
  });

  it('submits trimmed text and only clears the draft after a successful send', async () => {
    const submitTextTurn = vi
      .fn<(draftText: string) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        snapshot: {
          currentMode: 'speech',
          isSessionActive: true,
          speechLifecycleStatus: 'listening',
          canSubmitComposerText: true,
        },
        submitTextTurn,
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

    expect(submitTextTurn).toHaveBeenCalledWith('successful send');
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

    expect(submitTextTurn).toHaveBeenLastCalledWith('keep draft');
    expect(result.current.draftText).toBe('  keep draft  ');
  });

  it('starts screen sharing before microphone capture when toggled from an inactive composer', async () => {
    const startSpeechModeWithContext = vi.fn(async () => true);
    const setInputEnabled = vi.fn(async () => undefined);
    const setContextSharingEnabled = vi.fn(async () => undefined);
    mockUseDomainRuntimeHost.mockReturnValue(
      createHost({
        startSpeechModeWithContext,
        setInputEnabled,
        setContextSharingEnabled,
      }),
    );

    const { result } = renderHook(() => useAssistantPanelController());

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(startSpeechModeWithContext).toHaveBeenCalledTimes(1);
    expect(setInputEnabled).not.toHaveBeenCalled();
    expect(setContextSharingEnabled).not.toHaveBeenCalled();
  });
});
