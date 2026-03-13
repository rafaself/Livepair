import type { HTMLAttributes } from 'react';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge, IconButton } from '../primitives';
import type { ConversationTimelineEntry } from '../../runtime/conversation/conversation.types';
import { isTranscriptArtifact } from '../../runtime/conversation/conversation.types';
import { TypingIndicator } from './TypingIndicator';
import { renderAssistantMarkdown } from './renderAssistantMarkdown';
import './ConversationTurn.css';

export type ConversationTurnProps = {
  turn: ConversationTimelineEntry;
} & HTMLAttributes<HTMLElement>;

const TURN_LABELS = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System',
} as const;

function getBadgeVariant(turn: ConversationTimelineEntry): 'default' | 'error' {
  return turn.state === 'error' ? 'error' : 'default';
}

export function ConversationTurn({
  turn,
  className,
  ...rest
}: ConversationTurnProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const isTranscript = isTranscriptArtifact(turn);
  const isInterruptedTranscript = isTranscript && turn.statusLabel === 'Interrupted';
  const isTypedNote = !isTranscript && turn.role === 'user' && turn.source === 'text';

  const classes = [
    'conversation-turn',
    `conversation-turn--${turn.role}`,
    turn.state === 'error' ? 'conversation-turn--error' : '',
    isTranscript ? 'conversation-turn--transcript' : '',
    isInterruptedTranscript ? 'conversation-turn--transcript-interrupted' : '',
    isTypedNote ? 'conversation-turn--typed-note' : '',
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

  const artifactKind = isTranscript ? 'transcript' : 'turn';
  const showCopyButton = turn.role === 'assistant' && !isTypingOnly && !isTranscript;

  return (
    <article
      className={classes}
      aria-label={`${TURN_LABELS[turn.role]} ${artifactKind} at ${turn.timestamp}`}
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
            {showCopyButton ? (
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
            {isTypedNote ? (
              <Badge variant="default">Note</Badge>
            ) : null}
            {turn.statusLabel ? (
              <Badge variant={getBadgeVariant(turn)}>{turn.statusLabel}</Badge>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
