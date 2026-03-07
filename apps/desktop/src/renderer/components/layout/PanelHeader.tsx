import type { ReactNode } from 'react';
import './PanelHeader.css';

export type PanelHeaderProps = {
  title?: string;
  children?: ReactNode;
};

export function PanelHeader({
  title,
  children,
}: PanelHeaderProps): JSX.Element {
  return (
    <header className="panel-header">
      {title && <h2 className="panel-header__title">{title}</h2>}
      {children && <div className="panel-header__actions">{children}</div>}
    </header>
  );
}
