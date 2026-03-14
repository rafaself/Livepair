import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createControlGatingSnapshot } from '../../../runtime';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';

describe('useAssistantPanelComposerMediaActions', () => {
  it('stops voice capture after starting speech mode when the microphone preference is off', async () => {
    let isComposerMicrophoneEnabled = false;
    const onStartVoiceSession = vi.fn(async () => undefined);
    const onStopVoiceCapture = vi.fn(async () => undefined);
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
        voiceSessionStatus: 'disconnected',
        screenCaptureState: 'disabled',
        onStartVoiceSession,
        onStartVoiceCapture: vi.fn(async () => undefined),
        onStopVoiceCapture,
        onStartScreenCapture: vi.fn(async () => undefined),
        onStopScreenCapture: vi.fn(async () => undefined),
        onEndSpeechMode: vi.fn(async () => undefined),
      }),
    );

    await act(async () => {
      await result.current.handleStartSpeechMode();
    });

    expect(onStartVoiceSession).toHaveBeenCalledTimes(1);
    expect(onStopVoiceCapture).toHaveBeenCalledTimes(1);
  });

  it('queues screen capture until the voice session becomes ready', async () => {
    let voiceSessionStatus: 'connecting' | 'ready' = 'connecting';
    const onStartVoiceSession = vi.fn(async () => undefined);
    const onStartScreenCapture = vi.fn(async () => undefined);
    const { result, rerender } = renderHook(() =>
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
        voiceSessionStatus,
        screenCaptureState: 'disabled',
        onStartVoiceSession,
        onStartVoiceCapture: vi.fn(async () => undefined),
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
    expect(onStartScreenCapture).not.toHaveBeenCalled();

    voiceSessionStatus = 'ready';
    rerender();

    await waitFor(() => {
      expect(onStartScreenCapture).toHaveBeenCalledTimes(1);
    });
  });
});
