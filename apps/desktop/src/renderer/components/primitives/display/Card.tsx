import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

export type CardProps = {
  elevated?: boolean;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Card({
  elevated = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  const classes = `card${elevated ? ' card--elevated' : ''}${className ? ` ${className}` : ''}`;

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
