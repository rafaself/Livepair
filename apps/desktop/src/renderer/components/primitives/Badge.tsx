import type { ReactNode } from 'react';
import './Badge.css';

export type BadgeProps = {
  variant?: 'default' | 'success' | 'warning' | 'error';
  children: ReactNode;
};

export function Badge({
  variant = 'default',
  children,
}: BadgeProps): JSX.Element {
  return (
    <span className={`badge badge--${variant}`}>
      {children}
    </span>
  );
}
