import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_CLOSE_ANIMATION_MS = 140;

type UseFloatingLayerOptions = {
  closeAnimationMs?: number;
  initialOpen?: boolean;
};

type UseFloatingLayerReturn = {
  isOpen: boolean;
  isClosing: boolean;
  shouldRender: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export function useFloatingLayer({
  closeAnimationMs = DEFAULT_CLOSE_ANIMATION_MS,
  initialOpen = false,
}: UseFloatingLayerOptions = {}): UseFloatingLayerReturn {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback((): void => {
    if (closeTimerRef.current === null) {
      return;
    }

    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const open = useCallback((): void => {
    clearCloseTimer();
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimer]);

  const close = useCallback((): void => {
    clearCloseTimer();
    setIsClosing(true);

    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      setIsOpen(false);
      closeTimerRef.current = null;
    }, closeAnimationMs);
  }, [clearCloseTimer, closeAnimationMs]);

  const toggle = useCallback((): void => {
    if (isOpen) {
      close();
      return;
    }

    open();
  }, [close, isOpen, open]);

  useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, [clearCloseTimer]);

  return {
    isOpen,
    isClosing,
    shouldRender: isOpen || isClosing,
    open,
    close,
    toggle,
  };
}
