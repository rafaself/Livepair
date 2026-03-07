import type { HTMLAttributes, ReactNode } from 'react';
import './Panel.css';

export type PanelProps = {
  isOpen: boolean;
  position?: 'left' | 'right';
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Panel({
  isOpen,
  position = 'right',
  className,
  children,
  ...rest
}: PanelProps): JSX.Element {
  const classes = [
    'panel',
    `panel--${position}`,
    isOpen && 'panel--open',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} {...rest}>
      {children}
    </section>
  );
}
