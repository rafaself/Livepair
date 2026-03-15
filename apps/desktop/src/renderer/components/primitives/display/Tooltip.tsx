import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import './Tooltip.css';

export type TooltipProps = {
  content: ReactNode;
  size?: number;
};

export function Tooltip({ content, size = 13 }: TooltipProps): JSX.Element {
  return (
    <span className="tooltip">
      <span className="tooltip__trigger">
        <Info size={size} />
      </span>
      <span className="tooltip__content">{content}</span>
    </span>
  );
}
