import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('renders all runtime states with matching classes and labels', () => {
    const runtimeStates = [
      { value: 'disconnected', label: 'Disconnected' },
      { value: 'ready', label: 'Ready' },
      { value: 'listening', label: 'Listening' },
      { value: 'thinking', label: 'Thinking' },
      { value: 'speaking', label: 'Speaking' },
      { value: 'error', label: 'Error' },
    ] as const;

    for (const runtimeState of runtimeStates) {
      const { unmount } = render(<StatusIndicator state={runtimeState.value} size="sm" />);
      const status = screen.getByRole('status');
      expect(status).toHaveClass('status-indicator--sm', `status-indicator--${runtimeState.value}`);
      expect(status).toHaveAttribute('aria-label', runtimeState.label);
      unmount();
    }
  });
});
