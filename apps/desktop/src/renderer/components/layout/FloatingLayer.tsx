import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  estimateFloatingContentHeight,
  resolveFloatingPosition,
  type FloatingPosition,
  type FloatingPositionOptions,
} from '../../hooks/floatingPositioning';
import { useDismissableLayer } from '../../hooks/useDismissableLayer';
import './FloatingLayer.css';

const FALLBACK_POSITION: FloatingPosition = {
  left: 8,
  offset: 8,
  width: 0,
  maxHeight: 0,
  placement: 'down',
};

export type FloatingLayerProps = {
  triggerRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  isClosing?: boolean;
  estimatedItemCount: number;
  onDismiss?: () => void;
  className?: string;
  children: ReactNode;
  positionOptions?: FloatingPositionOptions;
  portalTarget?: HTMLElement | null | undefined;
  measureContentWidth?: ((content: HTMLElement) => number) | undefined;
};

export function FloatingLayer({
  triggerRef,
  isOpen,
  isClosing = false,
  estimatedItemCount,
  onDismiss,
  className,
  children,
  positionOptions,
  portalTarget,
  measureContentWidth,
}: FloatingLayerProps): JSX.Element | null {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const syncPosition = useCallback((): void => {
    const trigger = triggerRef.current;

    if (!trigger || typeof window === 'undefined') {
      return;
    }

    const content = contentRef.current;
    const measuredHeight = content?.scrollHeight ?? 0;
    const measuredWidth = content && measureContentWidth ? measureContentWidth(content) : 0;
    const contentHeight =
      measuredHeight > 0 ? measuredHeight : estimateFloatingContentHeight(estimatedItemCount);

    const next = resolveFloatingPosition(
      {
        triggerRect: trigger.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        contentHeight,
      },
      measuredWidth > 0
        ? {
            ...positionOptions,
            minWidthPx: Math.max(positionOptions?.minWidthPx ?? 0, measuredWidth),
          }
        : positionOptions,
    );

    setPosition(next);
  }, [estimatedItemCount, measureContentWidth, positionOptions, triggerRef]);

  useDismissableLayer({
    enabled: isOpen,
    containerRef: triggerRef,
    extraRefs: [contentRef],
    onDismiss: () => {
      onDismiss?.();
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    syncPosition();
  }, [isOpen, syncPosition]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return;
    }

    const handleViewportChange = (): void => {
      syncPosition();
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, syncPosition]);

  const shouldRender = isOpen || isClosing;
  if (!shouldRender) {
    return null;
  }

  const resolvedPosition = position ?? FALLBACK_POSITION;
  const style: CSSProperties = {
    left: `${resolvedPosition.left}px`,
    width: `${resolvedPosition.width}px`,
    maxHeight: `${resolvedPosition.maxHeight}px`,
    ...(resolvedPosition.placement === 'up'
      ? { top: 'auto', bottom: `${resolvedPosition.offset}px` }
      : { top: `${resolvedPosition.offset}px`, bottom: 'auto' }),
  };

  const classes = [
    'floating-layer',
    resolvedPosition.placement === 'up' ? 'floating-layer--up' : 'floating-layer--down',
    isClosing ? 'floating-layer--closing' : 'floating-layer--open',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <div ref={contentRef} className={classes} style={style}>
      {children}
    </div>
  );

  if (typeof document === 'undefined') {
    return content;
  }

  return createPortal(content, portalTarget ?? document.body);
}
