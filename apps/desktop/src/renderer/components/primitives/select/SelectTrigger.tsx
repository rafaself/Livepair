import { ChevronDown } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './SelectTrigger.css';

export type SelectTriggerProps = {
  isOpen: boolean;
  onToggle: () => void;
  valueContent?: ReactNode;
  placeholder?: ReactNode;
  size?: 'sm' | 'md';
  ariaLabel?: string | undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick' | 'children' | 'size'>;

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(function SelectTrigger(
  {
    isOpen,
    onToggle,
    valueContent,
    placeholder = 'Select…',
    size = 'md',
    className,
    disabled,
    ariaLabel,
    onKeyDown,
    ...rest
  },
  ref,
): JSX.Element {
  const classes = [
    'select-trigger',
    `select-trigger--${size}`,
    isOpen ? 'select-trigger--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }

        onToggle();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (event.defaultPrevented || disabled) {
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      {...rest}
    >
      <span className="select-trigger__value">{valueContent ?? placeholder}</span>
      <span className="select-trigger__chevron" aria-hidden="true">
        <ChevronDown
          className={`select-trigger__chevron-icon${isOpen ? ' select-trigger__chevron-icon--open' : ''}`}
          strokeWidth={2}
        />
      </span>
    </button>
  );
});
