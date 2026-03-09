import { useEffect, useState } from 'react';
import { Bug, MessageCircle, Settings } from 'lucide-react';
import { OverlayContainer, Panel, PanelHeader } from '../layout';
import { Button, LivepairIcon } from '../primitives';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';
import {
  AssistantPanelSettingsContent,
  useAssistantPanelSettingsController,
} from './AssistantPanelSettingsView';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { ConversationList } from './ConversationList';
import { useAssistantPanelController } from './useAssistantPanelController';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  showStateDevControls?: boolean;
};

export function AssistantPanel({
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);
  const {
    assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
    setPanelView,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenFeedback,
    handleCheckBackendHealth,
    setAssistantState,
  } = useAssistantPanelController();
  const settingsController = useAssistantPanelSettingsController({
    enabled: hasInitializedSettings || panelView === 'settings',
  });

  useEffect(() => {
    if (panelView === 'settings') {
      setHasInitializedSettings(true);
    }
  }, [panelView]);

  return (
    <OverlayContainer>
      <Panel
        id="assistant-panel"
        role="complementary"
        aria-label="Assistant Panel"
        aria-hidden={!isPanelOpen}
        isOpen={isPanelOpen}
        className="assistant-panel"
      >
        <PanelHeader title="Livepair" icon={<LivepairIcon size={28} />}>
          {showStateDevControls ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPanelView('debug')}
              aria-label="Developer tools"
              aria-pressed={panelView === 'debug'}
              className={panelView === 'debug' ? 'assistant-panel__header-btn--active' : undefined}
            >
              <Bug size={16} />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPanelView('settings')}
            aria-label="Settings"
            aria-pressed={panelView === 'settings'}
            className={panelView === 'settings' ? 'assistant-panel__header-btn--active' : undefined}
          >
            <Settings size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPanelView('chat')}
            aria-label="Chat"
            aria-pressed={panelView === 'chat'}
            className={panelView === 'chat' ? 'assistant-panel__header-btn--active' : undefined}
          >
            <MessageCircle size={16} />
          </Button>
        </PanelHeader>
        <div className="assistant-panel__view">
          {panelView === 'chat' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelStateHero state={assistantState} />
              <section
                className="assistant-panel__conversation"
                aria-labelledby="assistant-panel-conversation-title"
              >
                <h3 id="assistant-panel-conversation-title">Conversation</h3>
                <ConversationList
                  turns={conversationTurns}
                  emptyState={(
                    <div className="assistant-panel__conversation-card assistant-panel__conversation-card--empty">
                      <MessageCircle size={56} strokeWidth={1.25} className="assistant-panel__conversation-empty-icon" aria-hidden="true" />
                      <p className="assistant-panel__conversation-empty-title">No conversation yet</p>
                      <p className="assistant-panel__conversation-empty-body">
                        When you start talking, Livepair will keep the latest exchange
                        here so you can stay oriented in the flow.
                      </p>
                    </div>
                  )}
                  className={isConversationEmpty ? undefined : 'assistant-panel__conversation-list'}
                />
                <div className="assistant-panel__bottom-fade" aria-hidden="true" />
              </section>
            </div>
          ) : null}

          {panelView === 'settings' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelSettingsContent controller={settingsController} />
            </div>
          ) : null}

          {(panelView === 'debug' && showStateDevControls) ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelDebugView
                assistantState={assistantState}
                backendState={backendState}
                backendIndicatorState={backendIndicatorState}
                backendLabel={backendLabel}
                tokenFeedback={tokenFeedback}
                onRetryBackendHealth={handleCheckBackendHealth}
                onSetAssistantState={setAssistantState}
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </OverlayContainer>
  );
}
