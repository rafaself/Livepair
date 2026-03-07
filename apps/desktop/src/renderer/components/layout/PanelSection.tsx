import type { HTMLAttributes, ReactNode } from 'react';
import './PanelSection.css';

export type PanelSectionProps = {
  title?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function PanelSection({
  title,
  children,
  className,
  ...rest
}: PanelSectionProps): JSX.Element {
  const classes = ['panel-section', className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...rest}>
      {title && <h3 className="panel-section__title">{title}</h3>}
      <div className="panel-section__body">{children}</div>
    </div>
  );
}
