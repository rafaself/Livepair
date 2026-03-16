import { useEffect, useRef } from 'react';
import type { ScreenContextMode } from '../../../shared';
import { Button } from '../primitives';
import { PanelDialog } from './PanelDialog';
import './ShareScreenModeDialog.css';

export type ConfiguredScreenContextMode = Exclude<ScreenContextMode, 'unconfigured'>;

export type ShareScreenModeDialogProps = {
  isOpen: boolean;
  isSaving: boolean;
  selectedMode: ConfiguredScreenContextMode | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  onSelectMode: (mode: ConfiguredScreenContextMode) => void;
};

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true';
  });
}

const MODE_OPTIONS: ReadonlyArray<{
  value: ConfiguredScreenContextMode;
  title: string;
  description: string;
}> = [
  {
    value: 'manual',
    title: 'Manual',
    description: 'Send only when you choose to share.',
  },
  {
    value: 'continuous',
    title: 'Continuous',
    description: 'Keep your screen updated automatically every 3 seconds.',
  },
];

export function ShareScreenModeDialog({
  isOpen,
  isSaving,
  selectedMode,
  onConfirm,
  onCancel,
  onSelectMode,
}: ShareScreenModeDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusInitialElement = (): void => {
      const focusableElements = getFocusableElements(dialog);
      const firstFocusableElement = focusableElements[0] ?? dialog;
      firstFocusableElement.focus();
    };

    focusInitialElement();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
        return;
      }

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement?.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <PanelDialog
      ref={dialogRef}
      titleId="share-screen-mode-title"
      descriptionId="share-screen-mode-description"
      frameClassName="share-screen-mode-dialog__frame"
      className="share-screen-mode-dialog"
    >
      <div className="share-screen-mode-dialog__header">
        <h2 id="share-screen-mode-title" className="share-screen-mode-dialog__title">
          Choose screen share mode
        </h2>
        <p id="share-screen-mode-description" className="share-screen-mode-dialog__description">
          Pick how Livepair should keep your screen in context.
        </p>
      </div>

      <div className="share-screen-mode-dialog__options" role="radiogroup" aria-label="Share Screen mode">
        {MODE_OPTIONS.map((option) => {
          const isSelected = selectedMode === option.value;

          return (
            <label
              key={option.value}
              className={`share-screen-mode-dialog__option${isSelected ? ' share-screen-mode-dialog__option--selected' : ''}`}
            >
              <input
                type="radio"
                name="share-screen-mode"
                value={option.value}
                checked={isSelected}
                onChange={() => {
                  onSelectMode(option.value);
                }}
              />
              <span className="share-screen-mode-dialog__option-copy">
                <span className="share-screen-mode-dialog__option-title">
                  {option.title}
                </span>
                <span className="share-screen-mode-dialog__option-description">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="share-screen-mode-dialog__actions">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Cancel Share Screen mode"
          disabled={isSaving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          aria-label="Confirm Share Screen mode"
          disabled={selectedMode === null || isSaving}
          onClick={() => {
            void onConfirm();
          }}
        >
          {isSaving ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </PanelDialog>
  );
}
