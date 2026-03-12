import { useEffect, useState } from 'react';

export type UseControlDockVisibilityOptions = {
  closePanel: () => void;
  isPanelOpen: boolean;
  isPanelPinned: boolean;
};

export type ControlDockVisibility = {
  isHovered: boolean;
  isWindowFocused: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export function useControlDockVisibility({
  closePanel,
  isPanelOpen,
  isPanelPinned,
}: UseControlDockVisibilityOptions): ControlDockVisibility {
  const [isHovered, setIsHovered] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());

  useEffect(() => {
    const handleWindowFocus = (): void => {
      setIsWindowFocused(true);
    };

    const handleWindowBlur = (): void => {
      setIsWindowFocused(false);
      if (isPanelOpen && !isPanelPinned) {
        closePanel();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [closePanel, isPanelOpen, isPanelPinned]);

  return {
    isHovered,
    isWindowFocused,
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  };
}
