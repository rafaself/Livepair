import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders default and explicit variants', () => {
    const { rerender } = render(<Badge>Default</Badge>);
    expect(screen.getByText('Default')).toHaveClass('badge', 'badge--default');

    rerender(<Badge variant="error">Error</Badge>);
    expect(screen.getByText('Error')).toHaveClass('badge--error');
  });
});

