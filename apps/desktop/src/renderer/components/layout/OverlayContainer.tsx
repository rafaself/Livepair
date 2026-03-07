import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import './OverlayContainer.css';

export type OverlayContainerProps = {
  children: ReactNode;
};

export function OverlayContainer({
  children,
}: OverlayContainerProps): JSX.Element {
  return createPortal(
    <div className="overlay-container">{children}</div>,
    document.body,
  ) as JSX.Element;
}
