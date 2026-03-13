import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelectContent } from './SelectContent';

describe('SelectContent', () => {
  it('renders listbox content', () => {
    render(
      <SelectContent isClosing={false}>
        <div>Option list</div>
      </SelectContent>,
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Option list')).toBeInTheDocument();
  });

  it('applies closing class while closing', () => {
    render(
      <SelectContent isClosing>
        <div>Option list</div>
      </SelectContent>,
    );

    expect(screen.getByRole('listbox')).toHaveClass('select-content--closing');
  });
});
