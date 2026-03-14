import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createControlGatingSnapshot } from '../../../runtime';
import { useAssistantPanelTextComposer } from './useAssistantPanelTextComposer';

describe('useAssistantPanelTextComposer', () => {
  it('submits trimmed text and clears the draft after a successful send', async () => {
    const onSubmitTextTurn = vi.fn(async () => true);
    const { result } = renderHook(() =>
      useAssistantPanelTextComposer({
        controlGatingSnapshot: createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'ready',
          voiceCaptureState: 'capturing',
          screenCaptureState: 'disabled',
        }),
        onSubmitTextTurn,
      }),
    );

    act(() => {
      result.current.handleDraftTextChange({
        currentTarget: { value: '  hello world  ' },
      } as ChangeEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      await result.current.handleSubmitTextTurn({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
    });

    expect(onSubmitTextTurn).toHaveBeenCalledWith('hello world');
    expect(result.current.draftText).toBe('');
  });

  it('preserves the draft when runtime submission or control gating declines the send', async () => {
    const onSubmitTextTurn = vi.fn(async () => false);
    const { result, rerender } = renderHook(
      ({
        controlGatingSnapshot,
      }: {
        controlGatingSnapshot: ReturnType<typeof createControlGatingSnapshot>;
      }) =>
        useAssistantPanelTextComposer({
          controlGatingSnapshot,
          onSubmitTextTurn,
        }),
      {
        initialProps: {
          controlGatingSnapshot: createControlGatingSnapshot({
            currentMode: 'speech',
            speechLifecycleStatus: 'listening',
            activeTransport: 'gemini-live',
            voiceSessionStatus: 'ready',
            voiceCaptureState: 'capturing',
            screenCaptureState: 'disabled',
          }),
        },
      },
    );

    act(() => {
      result.current.handleDraftTextChange({
        currentTarget: { value: '  keep me  ' },
      } as ChangeEvent<HTMLTextAreaElement>);
    });

    await act(async () => {
      await result.current.handleSubmitTextTurn({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
    });

    expect(onSubmitTextTurn).toHaveBeenCalledWith('keep me');
    expect(result.current.draftText).toBe('  keep me  ');

    rerender({
      controlGatingSnapshot: createControlGatingSnapshot({
        currentMode: 'inactive',
        speechLifecycleStatus: 'off',
        activeTransport: null,
        voiceSessionStatus: 'disconnected',
        voiceCaptureState: 'idle',
        screenCaptureState: 'disabled',
      }),
    });

    await act(async () => {
      await result.current.handleSubmitTextTurn({
        preventDefault: vi.fn(),
      } as unknown as FormEvent<HTMLFormElement>);
    });

    expect(onSubmitTextTurn).toHaveBeenCalledTimes(1);
    expect(result.current.draftText).toBe('  keep me  ');
  });
});
