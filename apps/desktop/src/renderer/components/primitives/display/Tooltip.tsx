import { Info } from 'lucide-react';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

export type TooltipProps = {
  content: ReactNode;
  label?: string;
  size?: number;
};

export function Tooltip({
  content,
  label = 'More information',
  size = 13,
}: TooltipProps): JSX.Element {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showTooltip() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 6, left: rect.left });
    }
    setVisible(true);
  }

  function hideTooltip() {
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
        aria-label={label}
        role="button"
        tabIndex={0}
        onBlur={hideTooltip}
        onFocus={showTooltip}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
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
