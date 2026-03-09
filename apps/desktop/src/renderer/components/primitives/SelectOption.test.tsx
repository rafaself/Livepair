import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectOption } from './SelectOption';

describe('SelectOption', () => {
  it('renders option label and selected state', () => {
    render(
      <SelectOption selected onSelect={() => {}}>
        Fast
      </SelectOption>,
    );

    expect(screen.getByRole('option')).toHaveTextContent('Fast');
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect on click', () => {
    const onSelect = vi.fn();

    render(<SelectOption onSelect={onSelect}>Fast</SelectOption>);
    fireEvent.click(screen.getByRole('option'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('selects on keyboard activation with Enter and Space', () => {
    const onSelect = vi.fn();

    render(<SelectOption onSelect={onSelect}>Fast</SelectOption>);
    const option = screen.getByRole('option');

    fireEvent.keyDown(option, { key: 'Enter' });
    fireEvent.keyDown(option, { key: ' ' });

    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('does not select when a custom keydown handler prevents the default behavior', () => {
    const onSelect = vi.fn();

    render(
      <SelectOption
        onSelect={onSelect}
        onKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        Fast
      </SelectOption>,
    );

    fireEvent.keyDown(screen.getByRole('option'), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
