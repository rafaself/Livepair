import type { HTMLAttributes } from 'react';
import { Badge } from '../primitives';
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
            <time className="conversation-turn__timestamp">{turn.timestamp}</time>
            {turn.statusLabel ? (
              <Badge variant={getBadgeVariant(turn)}>{turn.statusLabel}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
