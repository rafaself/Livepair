import type { ReactNode } from 'react';
import './PanelSection.css';

export type PanelSectionProps = {
  title?: string;
  children: ReactNode;
};

export function PanelSection({
  title,
  children,
}: PanelSectionProps): JSX.Element {
  return (
    <div className="panel-section">
      {title && <h3 className="panel-section__title">{title}</h3>}
      <div className="panel-section__body">{children}</div>
    </div>
  );
}
