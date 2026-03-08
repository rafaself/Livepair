import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('renders the system, light, and dark theme options', () => {
    render(<ThemeToggle value="system" className="test-theme-toggle" onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveClass(
      'theme-toggle',
      'test-theme-toggle',
    );
    expect(screen.getByRole('radio', { name: 'Use system theme' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Use light theme' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Use dark theme' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('delegates theme selection changes', () => {
    const onChange = vi.fn();

    render(<ThemeToggle value="light" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Use dark theme' }));

    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
