import { useEffect } from 'react';

const SELECTOR = '.control-dock, .panel.panel--open';

function isInteractiveOverlayElement(node: EventTarget | null): node is Element {
  return node instanceof Element && node.closest(SELECTOR) !== null;
}

function isFocusInsideInteractiveOverlay(): boolean {
  return isInteractiveOverlayElement(document.activeElement);
}

export function useOverlayPointerPassthrough(): void {
  useEffect(() => {
    if (window.bridge?.overlayMode !== 'forwarded-pointer') {
      return;
    }

    let passthroughEnabled: boolean | null = null;

    const setPassthrough = (enabled: boolean): void => {
      if (passthroughEnabled === enabled) {
        return;
      }

      passthroughEnabled = enabled;
      void window.bridge?.setOverlayPointerPassthrough(enabled);
    };

    const handleEnterOverlay = (event: Event): void => {
      if (!isInteractiveOverlayElement(event.target)) {
        return;
      }

      setPassthrough(false);
    };

    const maybeRestorePassthrough = (relatedTarget: EventTarget | null): void => {
      if (isInteractiveOverlayElement(relatedTarget) || isFocusInsideInteractiveOverlay()) {
        return;
      }

      setPassthrough(true);
    };

    const handlePointerOut = (event: PointerEvent): void => {
      if (!isInteractiveOverlayElement(event.target)) {
        return;
      }

      maybeRestorePassthrough(event.relatedTarget);
    };

    const handleFocusOut = (event: FocusEvent): void => {
      if (!isInteractiveOverlayElement(event.target)) {
        return;
      }

      maybeRestorePassthrough(event.relatedTarget);
    };

    const handleWindowBlur = (): void => {
      setPassthrough(true);
    };

    setPassthrough(true);
    document.addEventListener('pointerover', handleEnterOverlay, true);
    document.addEventListener('focusin', handleEnterOverlay, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusout', handleFocusOut, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('pointerover', handleEnterOverlay, true);
      document.removeEventListener('focusin', handleEnterOverlay, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('blur', handleWindowBlur);
      setPassthrough(true);
    };
  }, []);
}
