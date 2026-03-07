import { useEffect, useRef, type ReactNode } from 'react';
import './Modal.css';

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
};

export function Modal({
  isOpen,
  onClose,
  ariaLabel,
  children,
}: ModalProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const el = contentRef.current;
    if (el) {
      const focusable = el.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={`modal__backdrop${isOpen ? ' modal__backdrop--open' : ''}`}
      aria-hidden={!isOpen}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        className="modal__content"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  );
}
