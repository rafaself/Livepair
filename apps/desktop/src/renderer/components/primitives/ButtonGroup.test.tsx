import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ButtonGroup, type ButtonGroupOption } from './ButtonGroup';

type TestValue = 'system' | 'light' | 'dark';

const OPTIONS: readonly ButtonGroupOption<TestValue>[] = [
  { value: 'system', label: 'Use system theme' },
  { value: 'light', label: 'Use light theme' },
  { value: 'dark', label: 'Use dark theme' },
];

function ButtonGroupHarness({
  initialValue = 'system',
  options = OPTIONS,
  onChange = vi.fn<(value: TestValue) => void>(),
}: {
  initialValue?: TestValue;
  options?: readonly ButtonGroupOption<TestValue>[];
  onChange?: (value: TestValue) => void;
}): JSX.Element {
  const [value, setValue] = useState<TestValue>(initialValue);

  return (
    <ButtonGroup
      ariaLabel="Theme"
      className="test-button-group"
      options={options}
      value={value}
      onChange={(nextValue) => {
        onChange(nextValue);
        setValue(nextValue);
      }}
    />
  );
}

describe('ButtonGroup', () => {
  it('renders an accessible single-select group with the selected option focusable', () => {
    render(<ButtonGroupHarness />);

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    const systemOption = screen.getByRole('radio', { name: 'Use system theme' });
    const lightOption = screen.getByRole('radio', { name: 'Use light theme' });

    expect(group).toHaveClass('button-group', 'button-group--md', 'test-button-group');
    expect(systemOption).toHaveAttribute('aria-checked', 'true');
    expect(systemOption).toHaveAttribute('tabindex', '0');
    expect(lightOption).toHaveAttribute('aria-checked', 'false');
    expect(lightOption).toHaveAttribute('tabindex', '-1');
  });

  it('reports clicks for enabled options and ignores disabled ones', () => {
    const onChange = vi.fn<(value: TestValue) => void>();

    render(
      <ButtonGroupHarness
        onChange={onChange}
        options={[
          { value: 'system', label: 'Use system theme' },
          { value: 'light', label: 'Use light theme' },
          { value: 'dark', label: 'Use dark theme', disabled: true },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Use light theme' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Use dark theme' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('light');
    expect(screen.getByRole('radio', { name: 'Use dark theme' })).toBeDisabled();
  });

  it('supports keyboard navigation, skips disabled options, and updates focus', () => {
    render(
      <ButtonGroupHarness
        options={[
          { value: 'system', label: 'Use system theme' },
          { value: 'light', label: 'Use light theme', disabled: true },
          { value: 'dark', label: 'Use dark theme' },
        ]}
      />,
    );

    const systemOption = screen.getByRole('radio', { name: 'Use system theme' });
    const darkOption = screen.getByRole('radio', { name: 'Use dark theme' });

    systemOption.focus();
    fireEvent.keyDown(systemOption, { key: 'ArrowRight' });

    expect(darkOption).toHaveFocus();
    expect(darkOption).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(darkOption, { key: 'Home' });
    expect(systemOption).toHaveFocus();
    expect(systemOption).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(systemOption, { key: 'End' });
    expect(darkOption).toHaveFocus();
    expect(darkOption).toHaveAttribute('aria-checked', 'true');
  });
});
