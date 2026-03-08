import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders an accessible switch and reports the next checked state', () => {
    const onCheckedChange = vi.fn();

    render(<Switch aria-label="Lock panel" checked={false} onCheckedChange={onCheckedChange} />);

    const switchControl = screen.getByRole('switch', { name: 'Lock panel' });
    expect(switchControl).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(switchControl);

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});