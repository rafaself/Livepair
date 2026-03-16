import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../store/sessionStore';
import { resetDesktopStores } from '../test/store';
import { useSessionRuntime } from './useSessionRuntime';

describe('useSessionRuntime', () => {
  beforeEach(() => {
    resetDesktopStores();
    vi.clearAllMocks();
  });

  it('does not rerender for conversation timeline updates', () => {
    const onRender = vi.fn();

    const { result } = renderHook(() => {
      const runtime = useSessionRuntime();
      onRender();
      return runtime;
    });

    const initialRenderCount = onRender.mock.calls.length;

    act(() => {
      useSessionStore.getState().appendConversationTurn({
        id: 'user-turn-1',
        role: 'user',
        content: 'hello',
        timestamp: '10:00 AM',
      });
    });

    expect(onRender.mock.calls.length).toBe(initialRenderCount);

    act(() => {
      useSessionStore.getState().appendTranscriptArtifact({
        id: 'assistant-transcript-1',
        kind: 'transcript',
        role: 'assistant',
        content: 'hi there',
        timestamp: '10:00 AM',
        source: 'voice',
      });
    });

    expect(onRender.mock.calls.length).toBe(initialRenderCount);
    expect(result.current.currentMode).toBe('inactive');
    expect(result.current.activeTransport).toBeNull();
  });
});
