import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIndicator } from './StatusIndicator';

describe('StatusIndicator', () => {
  it('renders state label and size classes', () => {
    const { rerender } = render(<StatusIndicator state="connecting" />);
    let status = screen.getByRole('status');

    expect(status).toHaveClass('status-indicator--md', 'status-indicator--connecting');
    expect(status).toHaveAttribute('aria-label', 'Connecting');

    rerender(<StatusIndicator state="error" size="sm" />);
    status = screen.getByRole('status');
    expect(status).toHaveClass('status-indicator--sm', 'status-indicator--error');
    expect(status).toHaveAttribute('aria-label', 'Error');
  });
});
