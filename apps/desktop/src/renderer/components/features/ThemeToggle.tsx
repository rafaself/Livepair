import { Laptop, Moon, Sun } from 'lucide-react';
import { ButtonGroup, type ButtonGroupOption, type ButtonGroupProps } from '../primitives';
import type { ThemePreference } from '../../theme';

const THEME_OPTIONS: readonly ButtonGroupOption<ThemePreference>[] = [
  {
    value: 'system',
    label: 'Use system theme',
    icon: <Laptop aria-hidden="true" strokeWidth={1.8} />,
  },
  {
    value: 'light',
    label: 'Use light theme',
    icon: <Sun aria-hidden="true" strokeWidth={1.8} />,
  },
  {
    value: 'dark',
    label: 'Use dark theme',
    icon: <Moon aria-hidden="true" strokeWidth={1.8} />,
  },
];

export type ThemeToggleProps = {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
  className?: string;
  size?: ButtonGroupProps<ThemePreference>['size'];
};

export function ThemeToggle({
  value,
  onChange,
  className,
  size = 'md',
}: ThemeToggleProps): JSX.Element {
  const classes = ['theme-toggle', className].filter(Boolean).join(' ');

  return (
    <ButtonGroup
      ariaLabel="Theme"
      className={classes}
      options={THEME_OPTIONS}
      size={size}
      value={value}
      onChange={onChange}
    />
  );
}
