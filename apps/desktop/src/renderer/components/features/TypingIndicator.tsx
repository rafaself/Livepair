import type { HTMLAttributes } from 'react';
import './TypingIndicator.css';

export type TypingIndicatorProps = {
  label?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function TypingIndicator({
  label = 'Assistant is thinking',
  className,
  ...rest
}: TypingIndicatorProps): JSX.Element {
  const classes = `typing-indicator${className ? ` ${className}` : ''}`;

  return (
    <span
      className={classes}
      aria-label={label}
      role="status"
      {...rest}
    >
      <span className="typing-indicator__dot" />
      <span className="typing-indicator__dot" />
      <span className="typing-indicator__dot" />
    </span>
  );
}
