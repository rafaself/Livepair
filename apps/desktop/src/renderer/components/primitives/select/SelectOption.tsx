import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './SelectOption.css';

export type SelectOptionProps = {
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role' | 'children' | 'onClick'>;

export function SelectOption({
  selected = false,
  onSelect,
  children,
  className,
  onKeyDown,
  ...rest
}: SelectOptionProps): JSX.Element {
  const classes = ['select-option', selected ? 'select-option--selected' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={classes}
      onClick={() => {
        onSelect();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
