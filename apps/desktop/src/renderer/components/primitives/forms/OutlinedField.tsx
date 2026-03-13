import { type MouseEvent, type ReactNode } from 'react';
import './OutlinedField.css';

export type OutlinedFieldProps = {
  children: ReactNode;
  append?: ReactNode | undefined;
  label?: string | undefined;
  htmlFor?: string | undefined;
  size?: 'sm' | 'md' | undefined;
  focused?: boolean | undefined;
  filled?: boolean | undefined;
  floating?: boolean | undefined;
  invalid?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

function findFocusableControl(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])',
  );
}

export function OutlinedField({
  children,
  append,
  label,
  htmlFor,
  size = 'md',
  focused = false,
  filled = false,
  floating = false,
  invalid = false,
  disabled = false,
  className,
}: OutlinedFieldProps): JSX.Element {
  const rootClassName = ['outlined-field', `outlined-field--${size}`, label ? 'outlined-field--labeled' : '', className]
    .filter(Boolean)
    .join(' ');

  const handleMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest('input, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])')) {
      return;
    }

    const focusTarget = findFocusableControl(event.currentTarget);

    if (!focusTarget || document.activeElement === focusTarget) {
      return;
    }

    event.preventDefault();
    focusTarget.focus();
  };

  return (
    <div className={rootClassName}>
      <div
        className="outlined-field__control"
        onMouseDown={handleMouseDown}
        data-disabled={disabled ? 'true' : 'false'}
        data-filled={filled ? 'true' : 'false'}
        data-focused={focused ? 'true' : 'false'}
        data-floating={floating ? 'true' : 'false'}
        data-invalid={invalid ? 'true' : 'false'}
      >
        {label ? (
          <label className="outlined-field__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : null}
        <div className="outlined-field__content">
          {children}
          {append ? <div className="outlined-field__append">{append}</div> : null}
        </div>
        <div className="outlined-field__outline" aria-hidden="true">
          <div className="outlined-field__outline-start" />
          {label ? (
            <div className="outlined-field__outline-notch">
              <span className="outlined-field__outline-notch-label">{label}</span>
            </div>
          ) : null}
          <div className="outlined-field__outline-end" />
        </div>
      </div>
    </div>
  );
}
