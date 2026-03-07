import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './IconButton.css';

export type IconButtonProps = {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>;

export function IconButton({
  label,
  size = 'md',
  className,
  children,
  ...rest
}: IconButtonProps): JSX.Element {
  const classes = `icon-btn icon-btn--${size}${className ? ` ${className}` : ''}`;

  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
