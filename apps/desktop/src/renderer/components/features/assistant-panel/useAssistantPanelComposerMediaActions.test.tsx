import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createControlGatingSnapshot } from '../../../runtime';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';

describe('useAssistantPanelComposerMediaActions', () => {
  it('skips microphone start after starting speech mode when the microphone preference is off', async () => {
    let isComposerMicrophoneEnabled = false;
    const onStartVoiceSession = vi.fn(async () => undefined);
    const onStartVoiceCapture = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAssistantPanelComposerMediaActions({
        controlGatingSnapshot: createControlGatingSnapshot({
          currentMode: 'inactive',
          speechLifecycleStatus: 'off',
          voiceCaptureState: 'idle',
          screenCaptureState: 'disabled',
        }),
        composerSpeechActionKind: 'start',
        getIsComposerMicrophoneEnabled: () => isComposerMicrophoneEnabled,
        setComposerMicrophoneEnabled: vi.fn((enabled: boolean) => {
          isComposerMicrophoneEnabled = enabled;
        }),
        isVoiceSessionActive: false,
        voiceCaptureState: 'capturing',
        screenCaptureState: 'disabled',
        onStartVoiceSession,
        onStartVoiceCapture,
        onStopVoiceCapture: vi.fn(async () => undefined),
        onStartScreenCapture: vi.fn(async () => undefined),
        onStopScreenCapture: vi.fn(async () => undefined),
        onEndSpeechMode: vi.fn(async () => undefined),
      }),
    );

    await act(async () => {
      await result.current.handleStartSpeechMode();
    });

    expect(onStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(onStartVoiceCapture).not.toHaveBeenCalled();
  });

  it('starts screen capture immediately after the session resolves and then starts the microphone', async () => {
    const onStartVoiceSession = vi.fn(async () => undefined);
    const onStartVoiceCapture = vi.fn(async () => undefined);
    const onStartScreenCapture = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useAssistantPanelComposerMediaActions({
        controlGatingSnapshot: createControlGatingSnapshot({
          currentMode: 'inactive',
          speechLifecycleStatus: 'off',
          voiceCaptureState: 'idle',
          screenCaptureState: 'disabled',
        }),
        composerSpeechActionKind: 'start',
        getIsComposerMicrophoneEnabled: () => true,
        setComposerMicrophoneEnabled: vi.fn(),
        isVoiceSessionActive: false,
        voiceCaptureState: 'idle',
        screenCaptureState: 'disabled',
        onStartVoiceSession,
        onStartVoiceCapture,
        onStopVoiceCapture: vi.fn(async () => undefined),
        onStartScreenCapture,
        onStopScreenCapture: vi.fn(async () => undefined),
        onEndSpeechMode: vi.fn(async () => undefined),
      }),
    );

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(onStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(onStartScreenCapture).toHaveBeenCalledTimes(1);
    expect(onStartVoiceCapture).toHaveBeenCalledTimes(1);
    expect(onStartVoiceSession.mock.invocationCallOrder[0]).toBeLessThan(
      onStartScreenCapture.mock.invocationCallOrder[0]!,
    );
    expect(onStartScreenCapture.mock.invocationCallOrder[0]).toBeLessThan(
      onStartVoiceCapture.mock.invocationCallOrder[0]!,
    );
  });
});
