import { useCallback, useEffect, useRef, useState } from 'react';
import './Snackbar.css';

export type SnackbarVariant = 'error' | 'success' | 'warning' | 'info';

export type SnackbarProps = {
  id: string;
  message: string;
  variant?: SnackbarVariant;
  /** Auto-dismiss delay in ms. Defaults to 5000. */
  duration?: number;
  onDismiss: (id: string) => void;
};

const EXIT_DURATION_MS = 200;

const ICONS: Record<SnackbarVariant, JSX.Element> = {
  error: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 3L11 11M11 3L3 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  success: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 7.5L5.5 10L11 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 2L12 11H2L7 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 5.5V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="10" r="0.5" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="4" r="0.5" fill="currentColor" />
    </svg>
  ),
};

export function Snackbar({
  id,
  message,
  variant = 'error',
  duration = 5000,
  onDismiss,
}: SnackbarProps): JSX.Element {
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const startExit = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    exitTimerRef.current = setTimeout(() => onDismissRef.current(id), EXIT_DURATION_MS);
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(startExit, duration);
    return () => {
      clearTimeout(timer);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [duration, startExit]);

  const classes = ['snackbar', `snackbar--${variant}`, exiting && 'snackbar--exiting']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={classes}
      style={{ '--duration': `${duration}ms` } as React.CSSProperties}
    >
      <div className="snackbar__content">
        <span className="snackbar__icon">{ICONS[variant]}</span>
        <span className="snackbar__message">{message}</span>
        <button
          type="button"
          className="snackbar__close"
          aria-label="Dismiss notification"
          onClick={startExit}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      <div className="snackbar__progress" />
    </div>
  );
}
