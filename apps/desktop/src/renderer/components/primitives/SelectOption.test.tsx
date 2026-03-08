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
});
