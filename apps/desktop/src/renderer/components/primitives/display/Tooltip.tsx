import { Info } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipProps = {
  content: ReactNode;
  size?: number;
};

export function Tooltip({ content, size = 13 }: TooltipProps): JSX.Element {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleMouseEnter() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 6, left: rect.left });
    }
    setVisible(true);
  }

  function handleMouseLeave() {
    setVisible(false);
    hideTimer.current = setTimeout(() => setPos(null), 150);
  }

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  return (
    <span className="tooltip">
      <span
        ref={triggerRef}
        className="tooltip__trigger"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <Info size={size} />
      </span>
      {pos !== null &&
        createPortal(
          <span
            className="tooltip__content"
            data-visible={visible}
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}
