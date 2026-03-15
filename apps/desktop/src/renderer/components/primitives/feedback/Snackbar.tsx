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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 8 7.5 10.5 11 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5 14 13.5H2L8 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 7V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5.25" r="0.75" fill="currentColor" />
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
    >
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
            d="M2 2 12 12M12 2 2 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
