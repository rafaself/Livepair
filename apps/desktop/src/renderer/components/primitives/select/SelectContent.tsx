import type { HTMLAttributes, ReactNode } from 'react';
import './SelectContent.css';

export type SelectContentProps = {
  isClosing: boolean;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'>;

export function SelectContent({
  isClosing,
  children,
  className,
  ...rest
}: SelectContentProps): JSX.Element {
  const classes = ['select-content', isClosing ? 'select-content--closing' : 'select-content--open', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="listbox" tabIndex={-1} {...rest}>
      {children}
    </div>
  );
}
