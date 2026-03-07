import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('renders aria label and size class', () => {
    render(
      <IconButton label="Open menu" size="sm" className="custom-icon">
        X
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveClass(
      'icon-btn',
      'icon-btn--sm',
      'custom-icon',
    );
  });
});

