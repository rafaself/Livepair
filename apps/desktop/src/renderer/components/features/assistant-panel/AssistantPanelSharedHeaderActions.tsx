import { ArrowLeft, History, MessageCirclePlus } from 'lucide-react';
import { IconButton } from '../../primitives';

export type AssistantPanelSharedHeaderActionsProps = {
  panelView: 'chat' | 'history';
  onCreateChat?: () => Promise<void>;
  onOpenHistory?: () => void;
  onBackToChat?: () => void;
};

export function AssistantPanelSharedHeaderActions({
  panelView,
  onCreateChat,
  onOpenHistory,
  onBackToChat,
}: AssistantPanelSharedHeaderActionsProps): JSX.Element {
  return (
    <div className="assistant-panel__inner-header-content">
      <div className="assistant-panel__inner-header-actions" data-panel-view={panelView}>
        {panelView === 'chat' ? (
          <>
            <IconButton
              label="History"
              size="sm"
              className="assistant-panel__inner-header-action"
              disabled={onOpenHistory === undefined}
              onClick={onOpenHistory}
            >
              <History size={16} className="assistant-panel__inner-header-icon" />
            </IconButton>
            <IconButton
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
          </>
        ) : (
          <>
            <IconButton
              label="Back to chat"
              size="sm"
              className="assistant-panel__inner-header-action"
              disabled={onBackToChat === undefined}
              onClick={onBackToChat}
            >
              <ArrowLeft size={16} className="assistant-panel__inner-header-icon" />
            </IconButton>
            <span className="assistant-panel__inner-header-action-spacer" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}
