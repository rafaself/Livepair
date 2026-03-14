import { TriangleAlert } from 'lucide-react';
import type { LiveSessionRecord } from '@livepair/shared-types';
import type { ReactNode } from 'react';
import { ConversationList } from '../../conversation/ConversationList';
import type { ConversationTimelineEntry } from '../../../../runtime';

export type AssistantPanelConversationSectionProps = {
  emptyState: ReactNode;
  isConversationEmpty: boolean;
  isViewingPastChat?: boolean;
  lastRuntimeError: string | null;
  activeChatTitle?: string | null;
  latestLiveSession?: LiveSessionRecord | null;
  turns: ConversationTimelineEntry[];
};

function formatSessionTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getLatestSessionStatusLabel(session: LiveSessionRecord): string {
  if (session.status === 'failed') {
    return 'Ended unexpectedly';
  }

  if (session.status === 'ended') {
    return 'Ended';
  }

  return 'Active';
}

function getLatestSessionContinuationLabel(session: LiveSessionRecord): string {
  return session.restorable && session.resumptionHandle !== null && session.invalidatedAt === null
    ? 'Resume may be available'
    : 'New Live session likely';
}

function buildSessionMetadataRows(
  session: LiveSessionRecord,
): Array<{ label: string; value: string }> {
  const rows = [
    {
      label: 'Started',
      value: formatSessionTimestamp(session.startedAt),
    },
  ];

  if (session.endedAt !== null) {
    rows.push({
      label: 'Ended',
      value: formatSessionTimestamp(session.endedAt),
    });
  }

  if (session.endedAt === null && session.lastResumptionUpdateAt !== null) {
    rows.push({
      label: 'Resume state updated',
      value: formatSessionTimestamp(session.lastResumptionUpdateAt),
    });
  }

  return rows;
}

export function AssistantPanelConversationSection({
  emptyState,
  isConversationEmpty,
  isViewingPastChat = false,
  lastRuntimeError,
  activeChatTitle = null,
  latestLiveSession = null,
  turns,
}: AssistantPanelConversationSectionProps): JSX.Element {
  const shouldShowLatestSessionMetadata = isViewingPastChat && latestLiveSession !== null;
  const latestSessionMetadataRows = latestLiveSession ? buildSessionMetadataRows(latestLiveSession) : [];
  const shouldShowInlineRuntimeError = Boolean(lastRuntimeError) && !isConversationEmpty;
  const shouldShowMessageMeta =
    isViewingPastChat || shouldShowLatestSessionMetadata || shouldShowInlineRuntimeError;

  return (
    <div className="assistant-panel__messages-section">
      {shouldShowMessageMeta ? (
        <div className="assistant-panel__messages-meta">
          {isViewingPastChat ? (
            <div className="assistant-panel__history-state" role="status" aria-live="polite">
              <div className="assistant-panel__history-state-header">
                <div className="assistant-panel__history-state-copy">
                  <p className="assistant-panel__history-state-label">Viewing past chat</p>
                  <p className="assistant-panel__history-state-title">
                    {activeChatTitle ?? 'Untitled chat'}
                  </p>
                  <p className="assistant-panel__history-state-body">
                    Durable chat container with preserved context. Latest Live session details stay separate below.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {shouldShowLatestSessionMetadata ? (
            <section className="assistant-panel__session-history" aria-label="Latest Live session">
              <div className="assistant-panel__session-history-header">
                <p className="assistant-panel__session-history-title">Latest Live session</p>
                <div className="assistant-panel__session-history-badges">
                  <span className="assistant-panel__session-history-badge">
                    {getLatestSessionStatusLabel(latestLiveSession)}
                  </span>
                  <span className="assistant-panel__session-history-badge">
                    {getLatestSessionContinuationLabel(latestLiveSession)}
                  </span>
                </div>
              </div>
              <dl className="assistant-panel__session-history-list">
                {latestSessionMetadataRows.map((row) => (
                  <div key={row.label} className="assistant-panel__session-history-item">
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {shouldShowInlineRuntimeError ? (
            <div className="assistant-panel__runtime-error" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              <p>{lastRuntimeError}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <ConversationList
        turns={turns}
        emptyState={emptyState}
        className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
      />
    </div>
  );
}
