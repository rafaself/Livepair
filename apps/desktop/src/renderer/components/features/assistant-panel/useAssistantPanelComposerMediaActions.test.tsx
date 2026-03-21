import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createControlGatingSnapshot } from '../../../runtime';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';

describe('useAssistantPanelComposerMediaActions', () => {
  it('starts speech mode without manually starting the microphone', async () => {
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

  it('starts screen capture immediately after the session resolves without manually starting the microphone', async () => {
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
    expect(onStartVoiceCapture).not.toHaveBeenCalled();
    expect(onStartVoiceSession.mock.invocationCallOrder[0]).toBeLessThan(
      onStartScreenCapture.mock.invocationCallOrder[0]!,
    );
  });

  it('uses the microphone toggle as in-session mute and unmute', async () => {
    let isComposerMicrophoneEnabled = true;
    const onStartVoiceCapture = vi.fn(async () => undefined);
    const onStopVoiceCapture = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(
      ({ voiceCaptureState }: { voiceCaptureState: 'capturing' | 'stopped' }) =>
        useAssistantPanelComposerMediaActions({
          controlGatingSnapshot: createControlGatingSnapshot({
            currentMode: 'speech',
            speechLifecycleStatus: 'listening',
            voiceCaptureState,
            screenCaptureState: 'disabled',
          }),
          composerSpeechActionKind: 'end',
          getIsComposerMicrophoneEnabled: () => isComposerMicrophoneEnabled,
          setComposerMicrophoneEnabled: vi.fn((enabled: boolean) => {
            isComposerMicrophoneEnabled = enabled;
          }),
          isVoiceSessionActive: true,
          voiceCaptureState,
          screenCaptureState: 'disabled',
          onStartVoiceSession: vi.fn(async () => undefined),
          onStartVoiceCapture,
          onStopVoiceCapture,
          onStartScreenCapture: vi.fn(async () => undefined),
          onStopScreenCapture: vi.fn(async () => undefined),
          onEndSpeechMode: vi.fn(async () => undefined),
        }),
      {
        initialProps: {
          voiceCaptureState: 'capturing',
        },
      },
    );

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(onStopVoiceCapture).toHaveBeenCalledTimes(1);
    expect(onStartVoiceCapture).not.toHaveBeenCalled();

    rerender({ voiceCaptureState: 'stopped' });

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(onStartVoiceCapture).toHaveBeenCalledTimes(1);
  });
});
