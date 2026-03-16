import type { HTMLAttributes } from 'react';
import { useId, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { Badge, IconButton } from '../../primitives';
import { isTranscriptArtifact, type ConversationTimelineEntry } from '../../../runtime';
import { useSessionStore } from '../../../store/sessionStore';
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
  const attachedAssistantTurn = useSessionStore((state) =>
    isTranscript && turn.role === 'assistant' && turn.attachedTurnId
      ? state.conversationTurns.find((entry) => entry.id === turn.attachedTurnId) ?? null
      : null);
  const assistantTurnWithMetadata =
    !isTranscript && turn.role === 'assistant' ? turn : attachedAssistantTurn;
  const thinkingText =
    assistantTurnWithMetadata?.answerMetadata?.thinkingText?.trim() ?? '';
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
            {turn.statusLabel ? (
              <Badge variant={getBadgeVariant(turn)}>{turn.statusLabel}</Badge>
            ) : null}
          </div>
        </div>
        {showThinkingToggle ? (
          <div
            id={thinkingSectionId}
            className="conversation-turn__thinking"
            role="region"
            aria-label="Assistant thinking"
            aria-hidden={!isThinkingExpanded}
            data-expanded={isThinkingExpanded ? 'true' : 'false'}
            style={{
              maxHeight: isThinkingExpanded ? '24rem' : '0px',
              opacity: isThinkingExpanded ? 1 : 0,
            }}
          >
            <div className="conversation-turn__thinking-inner">
              <>
                <p className="conversation-turn__thinking-label">Assistant thinking</p>
                {renderAssistantMarkdown(
                  thinkingText,
                  'conversation-turn__body conversation-turn__thinking-content',
                )}
              </>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
