import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  raised?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'primary',
  size = 'md',
  raised = false,
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    raised && 'btn--raised',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
