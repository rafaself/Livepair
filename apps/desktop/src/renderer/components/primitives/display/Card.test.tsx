import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders default class and elevated variant', () => {
    const { rerender } = render(<Card>Default</Card>);
    expect(screen.getByText('Default')).toHaveClass('card');

    rerender(
      <Card elevated className="custom-card">
        Elevated
      </Card>,
    );

    expect(screen.getByText('Elevated')).toHaveClass(
      'card',
      'card--elevated',
      'custom-card',
    );
  });
});

