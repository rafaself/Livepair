import type { ReactNode } from 'react';
import './PanelHeader.css';

export type PanelHeaderProps = {
  title?: string;
  icon?: ReactNode;
  children?: ReactNode;
};

export function PanelHeader({
  title,
  icon,
  children,
}: PanelHeaderProps): JSX.Element {
  return (
    <header className="panel-header">
      <div className="panel-header__brand">
        {icon && <span className="panel-header__icon">{icon}</span>}
        {title && <h2 className="panel-header__title">{title}</h2>}
      </div>
      {children && <div className="panel-header__actions">{children}</div>}
    </header>
  );
}
