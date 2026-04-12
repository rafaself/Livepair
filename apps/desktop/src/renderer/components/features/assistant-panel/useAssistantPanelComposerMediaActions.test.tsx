import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAssistantPanelComposerMediaActions } from './useAssistantPanelComposerMediaActions';

describe('useAssistantPanelComposerMediaActions', () => {
  it('starts speech mode without manually starting the microphone', async () => {
    let isComposerMicrophoneEnabled = false;
    const onStartSpeechMode = vi.fn(async () => true);
    const onSetComposerMicrophoneEnabled = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useAssistantPanelComposerMediaActions({
        composerSpeechActionKind: 'start',
        canEndSpeechMode: false,
        canToggleScreenContext: false,
        getIsComposerMicrophoneEnabled: () => isComposerMicrophoneEnabled,
        setComposerMicrophoneEnabled: vi.fn((enabled: boolean) => {
          isComposerMicrophoneEnabled = enabled;
        }),
        onStartSpeechMode,
        onStartSpeechModeWithScreenShare: vi.fn(async () => true),
        onSetComposerMicrophoneEnabled,
        onToggleScreenCapture: vi.fn(async () => true),
        onEndSpeechMode: vi.fn(async () => false),
      }),
    );

    await act(async () => {
      await result.current.handleStartSpeechMode();
    });

    expect(onStartSpeechMode).toHaveBeenCalledTimes(1);
    expect(onSetComposerMicrophoneEnabled).not.toHaveBeenCalled();
  });

  it('starts screen capture through the runtime screen-share command after speech start', async () => {
    const onStartSpeechModeWithScreenShare = vi.fn(async () => true);
    const onToggleScreenCapture = vi.fn(async () => true);

    const { result } = renderHook(() =>
      useAssistantPanelComposerMediaActions({
        composerSpeechActionKind: 'start',
        canEndSpeechMode: false,
        canToggleScreenContext: false,
        getIsComposerMicrophoneEnabled: () => true,
        setComposerMicrophoneEnabled: vi.fn(),
        onStartSpeechMode: vi.fn(async () => true),
        onStartSpeechModeWithScreenShare,
        onSetComposerMicrophoneEnabled: vi.fn(async () => undefined),
        onToggleScreenCapture,
        onEndSpeechMode: vi.fn(async () => false),
      }),
    );

    await act(async () => {
      await result.current.handleToggleComposerScreenShare();
    });

    expect(onStartSpeechModeWithScreenShare).toHaveBeenCalledTimes(1);
    expect(onToggleScreenCapture).not.toHaveBeenCalled();
  });

  it('uses the runtime microphone command as in-session mute and unmute', async () => {
    let isComposerMicrophoneEnabled = true;
    const onSetComposerMicrophoneEnabled = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useAssistantPanelComposerMediaActions({
        composerSpeechActionKind: 'end',
        canEndSpeechMode: true,
        canToggleScreenContext: true,
        getIsComposerMicrophoneEnabled: () => isComposerMicrophoneEnabled,
        setComposerMicrophoneEnabled: vi.fn((enabled: boolean) => {
          isComposerMicrophoneEnabled = enabled;
        }),
        onStartSpeechMode: vi.fn(async () => true),
        onStartSpeechModeWithScreenShare: vi.fn(async () => true),
        onSetComposerMicrophoneEnabled,
        onToggleScreenCapture: vi.fn(async () => true),
        onEndSpeechMode: vi.fn(async () => true),
      }),
    );

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(onSetComposerMicrophoneEnabled).toHaveBeenCalledWith(false);

    await act(async () => {
      await result.current.handleToggleComposerMicrophone();
    });

    expect(onSetComposerMicrophoneEnabled).toHaveBeenCalledWith(true);
  });
});
