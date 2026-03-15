import { Info } from 'lucide-react';
import { useState, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipProps = {
  content: ReactNode;
  size?: number;
};

export function Tooltip({ content, size = 13 }: TooltipProps): JSX.Element {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  function handleMouseEnter() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.top - 6,
        left: rect.left,
      });
    }
  }

  return (
    <span className="tooltip">
      <span
        ref={triggerRef}
        className="tooltip__trigger"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
      >
        <Info size={size} />
      </span>
      {pos !== null &&
        createPortal(
          <span
            className="tooltip__content"
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}
