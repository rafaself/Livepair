import { ArrowRight, History, MessageCirclePlus } from 'lucide-react';
import { IconButton } from '../../primitives';

export type AssistantPanelSharedHeaderActionsProps = {
  panelView: 'chat' | 'history';
  showHistory?: boolean;
  showCreateChat?: boolean;
  showBackToChat?: boolean;
  onCreateChat?: () => Promise<void>;
  onOpenHistory?: () => void;
  onBackToChat?: () => void;
};

export function AssistantPanelSharedHeaderActions({
  panelView,
  showHistory = false,
  showCreateChat = false,
  showBackToChat = false,
  onCreateChat,
  onOpenHistory,
  onBackToChat,
}: AssistantPanelSharedHeaderActionsProps): JSX.Element {
  return (
    <div
      className="assistant-panel__inner-header-content"
      data-panel-view={panelView}
    >
      <div
        className="assistant-panel__inner-header-actions"
        data-panel-view={panelView}
      >
        {showCreateChat ? (
          <IconButton
            key="new-chat"
            label="New chat"
            size="sm"
            className="assistant-panel__inner-header-action"
            disabled={onCreateChat === undefined}
            onClick={() => {
              void onCreateChat?.();
            }}
          >
            <MessageCirclePlus size={16} className="assistant-panel__inner-header-icon" />
          </IconButton>
        ) : null}
        {showHistory ? (
          <IconButton
            key="history"
            label="History"
            size="sm"
            className="assistant-panel__inner-header-action"
            disabled={onOpenHistory === undefined}
            onClick={onOpenHistory}
          >
            <History size={16} className="assistant-panel__inner-header-icon" />
          </IconButton>
        ) : null}
        {showBackToChat ? (
          <IconButton
            key="back-to-chat"
            label="Back to chat"
            size="sm"
            className="assistant-panel__inner-header-action"
            disabled={onBackToChat === undefined}
            onClick={onBackToChat}
          >
            <ArrowRight size={16} className="assistant-panel__inner-header-icon" />
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}
