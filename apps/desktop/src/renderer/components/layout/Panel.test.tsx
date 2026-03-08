import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('applies open and position classes', () => {
    const { rerender } = render(
      <Panel isOpen={false} data-testid="panel">
        Body
      </Panel>,
    );

    expect(screen.getByTestId('panel')).toHaveClass('panel', 'panel--right');
    expect(screen.getByTestId('panel')).not.toHaveClass('panel--open');

    rerender(
      <Panel isOpen={true} position="left" className="custom" data-testid="panel">
        Body
      </Panel>,
    );

    expect(screen.getByTestId('panel')).toHaveClass(
      'panel',
      'panel--left',
      'panel--open',
      'custom',
    );
  });
});
