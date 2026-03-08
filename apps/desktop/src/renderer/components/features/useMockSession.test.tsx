import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMockSession } from './useMockSession';
import type { AssistantRuntimeState } from '../../state/assistantUiState';

type HookHarnessProps = {
  enabled?: boolean;
};

function HookHarness({
  enabled = true,
}: HookHarnessProps): JSX.Element {
  const [assistantState, setAssistantState] = useState<AssistantRuntimeState>('disconnected');
  const session = useMockSession({
    assistantState,
    enabled,
    setAssistantState,
  });

  return (
    <div>
      <output aria-label="assistant-state">{assistantState}</output>
      <output aria-label="turn-count">{String(session.turns.length)}</output>
      <output aria-label="last-turn">
        {session.turns.at(-1)?.content ?? 'none'}
      </output>
      <button type="button" onClick={() => setAssistantState('listening')}>
        start
      </button>
      <button type="button" onClick={() => setAssistantState('disconnected')}>
        stop
      </button>
    </div>
  );
}

describe('useMockSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the simulated lifecycle and streams assistant text incrementally', () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'start' }));
    });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByLabelText('turn-count')).toHaveTextContent('1');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('thinking');

    act(() => {
      vi.advanceTimersByTime(1500);
      vi.advanceTimersByTime(250);
    });

    expect(Number(screen.getByLabelText('turn-count').textContent)).toBeGreaterThan(1);
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('speaking');
    expect(screen.getByLabelText('last-turn').textContent).not.toBe('none');
  });

  it('resets the conversation when the session is explicitly ended', () => {
    render(<HookHarness />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'start' }));
    });

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(Number(screen.getByLabelText('turn-count').textContent)).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'stop' }));
    });

    expect(screen.getByLabelText('turn-count')).toHaveTextContent('0');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
  });

  it('does not start when disabled', () => {
    render(<HookHarness enabled={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'start' }));
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByLabelText('turn-count')).toHaveTextContent('0');
  });
});
