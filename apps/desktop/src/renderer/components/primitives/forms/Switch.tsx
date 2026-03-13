import type { ButtonHTMLAttributes } from 'react';
import './Switch.css';

export type SwitchProps = {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role' | 'aria-checked'>;

export function Switch({
  checked,
  onCheckedChange,
  className,
  onClick,
  ...rest
}: SwitchProps): JSX.Element {
  const classes = `switch${checked ? ' switch--checked' : ''}${className ? ` ${className}` : ''}`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={classes}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked);
        }
      }}
      {...rest}
    >
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
    </button>
  );
}