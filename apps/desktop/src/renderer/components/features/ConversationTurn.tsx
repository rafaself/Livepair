import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge, IconButton } from '../primitives';
import type { ConversationTurnModel } from '../../runtime/conversation/conversation.types';
import { TypingIndicator } from './TypingIndicator';
import { renderAssistantMarkdown } from './renderAssistantMarkdown';
import './ConversationTurn.css';

export type ConversationTurnProps = {
  turn: ConversationTurnModel;
} & HTMLAttributes<HTMLElement>;

const TURN_LABELS = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
} as const;

function getBadgeVariant(turn: ConversationTurnModel): 'default' | 'error' {
  return turn.state === 'error' ? 'error' : 'default';
}

export function ConversationTurn({
  turn,
  className,
  ...rest
}: ConversationTurnProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const classes = [
    'conversation-turn',
    `conversation-turn--${turn.role}`,
    turn.state === 'error' ? 'conversation-turn--error' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const isTypingOnly =
    turn.role === 'assistant' &&
    turn.state === 'streaming' &&
    turn.content.trim().length === 0;

  const handleCopy = (): void => {
    void navigator.clipboard.writeText(turn.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article
      className={classes}
      aria-label={`${TURN_LABELS[turn.role]} turn at ${turn.timestamp}`}
      {...rest}
    >
      <div className="conversation-turn__bubble">
        {isTypingOnly ? (
          <TypingIndicator className="conversation-turn__typing" />
        ) : turn.role === 'assistant' ? (
          renderAssistantMarkdown(turn.content)
        ) : (
          <p className="conversation-turn__body">{turn.content}</p>
        )}

        <div className="conversation-turn__meta">
          <div className="conversation-turn__meta-main">
            {turn.role === 'assistant' && !isTypingOnly ? (
              <IconButton
                label={copied ? 'Copied' : 'Copy message'}
                size="sm"
                className="conversation-turn__copy-btn"
                onClick={handleCopy}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </IconButton>
            ) : (
              <time className="conversation-turn__timestamp">{turn.timestamp}</time>
            )}
            {turn.statusLabel ? (
              <Badge variant={getBadgeVariant(turn)}>{turn.statusLabel}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
