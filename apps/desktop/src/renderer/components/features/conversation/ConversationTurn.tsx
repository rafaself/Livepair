import type { HTMLAttributes } from 'react';
import { useId, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Mic } from 'lucide-react';
import { Badge, IconButton } from '../../primitives';
import { isTranscriptArtifact, type ConversationTimelineEntry } from '../../../runtime';
import { TypingIndicator } from '../TypingIndicator';
import { renderAssistantMarkdown } from '../assistant-panel/chat/renderAssistantMarkdown';
import { useSettingsStore } from '../../../store/settingsStore';
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
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
  const chatTimestampVisibility = useSettingsStore((state) => state.settings.chatTimestampVisibility);
  const thinkingSectionId = useId();

  const isTranscript = isTranscriptArtifact(turn);
  const isStreamingTranscript = isTranscript && turn.state === 'streaming';
  const isInterruptedTranscript = isTranscript && turn.statusLabel === 'Interrupted';
  const isCompletedTranscript = isTranscript && turn.state === 'complete' && !isInterruptedTranscript;
  const isTypedNote = !isTranscript && turn.role === 'user' && turn.source === 'text';
  const thinkingText =
    !isTranscript && turn.role === 'assistant'
      ? turn.answerMetadata?.thinkingText?.trim() ?? ''
      : '';
  const hasThinkingText = thinkingText.length > 0;

  const classes = [
    'conversation-turn',
    `conversation-turn--${turn.role}`,
    turn.state === 'error' ? 'conversation-turn--error' : '',
    isStreamingTranscript ? 'conversation-turn--transcript-streaming' : '',
    isCompletedTranscript ? 'conversation-turn--transcript-complete' : '',
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
  const showCopyButton = turn.role === 'assistant' && !isTypingOnly && !isStreamingTranscript;
  const showThinkingToggle = showCopyButton && hasThinkingText;

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
              <div className="conversation-turn__actions">
                <IconButton
                  label={copied ? 'Copied' : 'Copy message'}
                  size="sm"
                  className="conversation-turn__copy-btn"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
                {showThinkingToggle ? (
                  <button
                    type="button"
                    className="conversation-turn__thinking-toggle"
                    aria-label={isThinkingExpanded ? 'Hide assistant thinking' : 'Show assistant thinking'}
                    aria-expanded={isThinkingExpanded}
                    aria-controls={thinkingSectionId}
                    onClick={() => setIsThinkingExpanded((expanded) => !expanded)}
                  >
                    <span>Thinking</span>
                    {isThinkingExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : null}
              </div>
            ) : chatTimestampVisibility === 'visible' ? (
              <time className="conversation-turn__timestamp">{turn.timestamp}</time>
            ) : null}
            {isTypedNote ? (
              <Badge variant="default">Note</Badge>
            ) : null}
            {isCompletedTranscript ? (
              <Badge variant="default"><Mic size={10} /> Voice</Badge>
            ) : null}
            {turn.statusLabel ? (
              <Badge variant={getBadgeVariant(turn)}>{turn.statusLabel}</Badge>
            ) : null}
          </div>
        </div>
        {showThinkingToggle ? (
          <div
            id={thinkingSectionId}
            className="conversation-turn__thinking"
            hidden={!isThinkingExpanded}
          >
            {isThinkingExpanded ? (
              <>
                <p className="conversation-turn__thinking-label">Assistant thinking</p>
                <p className="conversation-turn__thinking-content">{thinkingText}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
