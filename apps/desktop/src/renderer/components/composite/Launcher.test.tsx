import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Launcher } from './Launcher';

describe('Launcher', () => {
  it('toggles aria attributes and open class by state', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Launcher isPanelOpen={false} onToggle={onToggle} />);

    const openButton = screen.getByRole('button', { name: /open assistant panel/i });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(openButton).toHaveClass('launcher');
    expect(openButton).not.toHaveClass('launcher--open');

    fireEvent.click(openButton);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Launcher isPanelOpen={true} onToggle={onToggle} />);
    const closeButton = screen.getByRole('button', { name: /close assistant panel/i });
    expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    expect(closeButton).toHaveClass('launcher--open');
  });
});

