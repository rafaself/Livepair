import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { ConversationTurn } from './ConversationTurn';
import type { ConversationTurnModel } from './mockConversation';
import './ConversationList.css';

export type ConversationListProps = {
  turns: readonly ConversationTurnModel[];
  emptyState: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const AUTO_SCROLL_THRESHOLD = 32;
const SCROLLBAR_IDLE_TIMEOUT_MS = 700;

function requestFrame(callback: () => void): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(callback, 0);
}

function cancelFrame(frameId: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
    return;
  }

  window.clearTimeout(frameId);
}

export function ConversationList({
  turns,
  emptyState,
  className,
  ...rest
}: ConversationListProps): JSX.Element {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const scrollbarTimeoutRef = useRef<number | null>(null);
  const [isScrollbarActive, setIsScrollbarActive] = useState(false);
  const classes = `conversation-list${turns.length > 0 ? ' conversation-list--populated' : ''}${className ? ` ${className}` : ''}`;

  const updateFollowBottom = useCallback((): void => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    followBottomRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((): void => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top: viewport.scrollHeight });
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  const activateScrollbar = useCallback((): void => {
    setIsScrollbarActive(true);

    if (scrollbarTimeoutRef.current !== null) {
      window.clearTimeout(scrollbarTimeoutRef.current);
    }

    scrollbarTimeoutRef.current = window.setTimeout(() => {
      setIsScrollbarActive(false);
      scrollbarTimeoutRef.current = null;
    }, SCROLLBAR_IDLE_TIMEOUT_MS);
  }, []);

  const handleScroll = useCallback((): void => {
    updateFollowBottom();
    activateScrollbar();
  }, [activateScrollbar, updateFollowBottom]);

  useEffect(() => {
    if (turns.length === 0 || !followBottomRef.current) {
      return;
    }

    frameRef.current = requestFrame(scrollToBottom);

    return () => {
      if (frameRef.current !== null) {
        cancelFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [scrollToBottom, turns]);

  useEffect(() => () => {
    if (scrollbarTimeoutRef.current !== null) {
      window.clearTimeout(scrollbarTimeoutRef.current);
    }
  }, []);

  if (turns.length === 0) {
    return (
      <div className={classes} {...rest}>
        <div className="conversation-list__frame conversation-list__frame--empty">
          <div className="conversation-list__empty">
            {emptyState}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={classes} {...rest}>
      <div
        className="conversation-list__top-fade"
        data-testid="conversation-list-top-fade"
        aria-hidden="true"
      />
      <div className="conversation-list__frame">
        <div
          ref={viewportRef}
          className={`conversation-list__viewport${isScrollbarActive ? ' conversation-list__viewport--scrolling' : ''}`}
          data-testid="conversation-list-viewport"
          onScroll={handleScroll}
        >
          <ul className="conversation-list__items">
            {turns.map((turn) => (
              <li key={turn.id} className="conversation-list__item">
                <ConversationTurn turn={turn} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
