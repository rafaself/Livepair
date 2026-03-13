import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectTrigger } from './SelectTrigger';

describe('SelectTrigger', () => {
  it('renders selected value content', () => {
    render(
      <SelectTrigger
        isOpen={false}
        onToggle={() => {}}
        valueContent="Fast"
        ariaLabel="Mode"
      />,
    );

    expect(screen.getByRole('button', { name: 'Mode' })).toHaveTextContent('Fast');
  });

  it('renders placeholder when no value is selected', () => {
    render(
      <SelectTrigger
        isOpen={false}
        onToggle={() => {}}
        placeholder="Select mode"
        ariaLabel="Mode"
      />,
    );

    expect(screen.getByRole('button', { name: 'Mode' })).toHaveTextContent('Select mode');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();

    render(
      <SelectTrigger
        isOpen={false}
        onToggle={onToggle}
        valueContent="Fast"
        ariaLabel="Mode"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mode' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
