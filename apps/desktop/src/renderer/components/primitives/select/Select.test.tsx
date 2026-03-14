import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Select, type SelectOptionItem } from '../index';

describe('Select', () => {
  const options = [
    { value: 'fast', label: 'Fast' },
    { value: 'thinking', label: 'Thinking' },
  ] satisfies readonly SelectOptionItem[];

  it('exposes --floating-content-max-height on the floating layer when opened', () => {
    render(
      <Select
        options={options}
        value="fast"
        aria-label="Mode"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mode' }));

    const layer = document.querySelector('.floating-layer') as HTMLElement;
    expect(layer.style.getPropertyValue('--floating-content-max-height')).toMatch(/^\d+px$/);
  });

  it('supports forcing the dropdown to open upward', () => {
    render(
      <Select
        options={options}
        value="fast"
        placement="up"
        aria-label="Mode"
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Mode' });
    trigger.getBoundingClientRect = () => ({
      top: 120,
      left: 80,
      right: 200,
      bottom: 152,
      width: 120,
      height: 32,
      x: 80,
      y: 120,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(trigger);

    expect(document.querySelector('.floating-layer')).toHaveClass('floating-layer--up');
  });

  it('opens options and selects an option', () => {
    const onChange = vi.fn((event: { target: { value: string } }) => event.target.value);

    render(
      <Select
        options={options}
        value="fast"
        onChange={onChange}
        aria-label="Mode"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveReturnedWith('thinking');
  });

  it('passes currentTarget and name in the change event', () => {
    const observed = {
      currentTargetValue: '',
      currentTargetName: '',
      targetName: '',
    };

    render(
      <Select
        options={options}
        value="fast"
        name="preferredMode"
        onChange={(event) => {
          observed.currentTargetValue = event.currentTarget.value;
          observed.currentTargetName = event.currentTarget.name;
          observed.targetName = event.target.name;
        }}
        aria-label="Mode"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(observed.currentTargetValue).toBe('thinking');
    expect(observed.currentTargetName).toBe('preferredMode');
    expect(observed.targetName).toBe('preferredMode');
  });

  it('keeps the native select labelable and forwards focus to the trigger', () => {
    render(
      <>
        <label htmlFor="preferred-mode">Preferred mode</label>
        <Select
          id="preferred-mode"
          options={options}
          value="fast"
          aria-label="Mode"
        />
      </>,
    );

    const nativeSelect = document.querySelector('select#preferred-mode');
    if (!nativeSelect) {
      throw new Error('Expected a native select with the provided id');
    }

    fireEvent.focus(nativeSelect);

    expect(screen.getByRole('button', { name: 'Mode' })).toHaveFocus();
  });

  it('renders placeholder when no selected value', () => {
    render(
      <Select
        options={options}
        value=""
        placeholder="Select mode"
        aria-label="Mode"
      />,
    );

    expect(screen.getByRole('button', { name: 'Mode' })).toHaveTextContent('Select mode');
  });
});
