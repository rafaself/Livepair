import type { HTMLAttributes, ReactNode, Ref } from 'react';
import './Panel.css';

export type PanelProps = {
  isOpen: boolean;
  position?: 'left' | 'right';
  panelRef?: Ref<HTMLElement> | undefined;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>;

export function Panel({
  isOpen,
  position = 'right',
  panelRef,
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
    <section ref={panelRef} className={classes} {...rest}>
      {children}
    </section>
  );
}
