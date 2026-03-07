import type { ReactNode } from 'react';
import './PanelFooter.css';

export type PanelFooterProps = {
  children: ReactNode;
};

export function PanelFooter({ children }: PanelFooterProps): JSX.Element {
  return <footer className="panel-footer">{children}</footer>;
}
