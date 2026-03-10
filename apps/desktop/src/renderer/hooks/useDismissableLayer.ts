import { useEffect, type RefObject } from 'react';

export type UseDismissableLayerOptions = {
  enabled: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  extraRefs?: readonly RefObject<HTMLElement | null>[];
  containsTarget?: (target: Node) => boolean;
  onDismiss: () => void;
  onEscape?: () => void;
  onPointerDown?: (target: Node) => void;
};

const containsTargetWithinRefs = (
  target: Node,
  refs: readonly RefObject<HTMLElement | null>[],
): boolean => {
  return refs.some((ref) => {
    return ref.current?.contains(target) ?? false;
  });
};

const getActiveNode = (): Node | null => {
  return document.activeElement instanceof Node ? document.activeElement : null;
};

export function useDismissableLayer({
  enabled,
  containerRef,
  extraRefs,
  containsTarget,
  onDismiss,
  onEscape,
  onPointerDown,
}: UseDismissableLayerOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const refs = [containerRef, ...(extraRefs ?? [])].filter(
      (ref): ref is RefObject<HTMLElement | null> => {
        return ref !== undefined;
      },
    );
    const isOwnedTarget = (target: Node): boolean => {
      const isWithinRefs = containsTargetWithinRefs(target, refs);
      const isWithinCustomOwnedArea = containsTarget?.(target) ?? false;
      return isWithinRefs || isWithinCustomOwnedArea;
    };
    let focusStartedInside =
      getActiveNode() !== null ? isOwnedTarget(getActiveNode() as Node) : false;

    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (onPointerDown) {
        onPointerDown(target);
        return;
      }

      if (isOwnedTarget(target)) {
        return;
      }

      focusStartedInside = false;
      onDismiss();
    };

    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (isOwnedTarget(target)) {
        focusStartedInside = true;
        return;
      }

      if (!focusStartedInside) {
        return;
      }

      focusStartedInside = false;
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      (onEscape ?? onDismiss)();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [containerRef, containsTarget, enabled, extraRefs, onDismiss, onEscape, onPointerDown]);
}
