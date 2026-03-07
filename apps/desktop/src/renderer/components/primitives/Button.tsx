import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = `btn btn--${variant} btn--${size}${className ? ` ${className}` : ''}`;

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}
