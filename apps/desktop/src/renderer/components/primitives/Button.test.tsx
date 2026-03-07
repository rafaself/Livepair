import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders default classes and supports click handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Primary</Button>);

    const button = screen.getByRole('button', { name: 'Primary' });
    expect(button).toHaveClass('btn', 'btn--primary', 'btn--md');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders custom variant, size and className', () => {
    render(
      <Button variant="secondary" size="lg" className="custom-class">
        Secondary
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass(
      'btn--secondary',
      'btn--lg',
      'custom-class',
    );
  });
});
