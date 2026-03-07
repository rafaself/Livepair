import { Bug, Settings } from 'lucide-react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import { OverlayContainer, Panel, PanelHeader } from '../layout';
import { Button } from '../primitives';
import { AssistantPanelDebugModal } from './AssistantPanelDebugModal';
import { AssistantPanelSettingsModal } from './AssistantPanelSettingsModal';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';
import { useAssistantPanelController } from './useAssistantPanelController';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  showStateDevControls?: boolean;
};

const CONVERSATION_HINTS: Record<AssistantRuntimeState, string> = {
  disconnected: 'Open a voice session when you are ready to talk.',
  ready: '',
  listening: 'Speak naturally. Your latest exchange will appear here.',
  thinking: 'Livepair is preparing the conversation.',
  speaking: 'Livepair is responding out loud.',
  error: 'The last attempt did not start cleanly. Try again when ready.',
};

export function AssistantPanel({
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
  const panel = useAssistantPanelController();
  const {
    assistantState,
    isPanelOpen,
    isSettingsOpen,
    isDebugOpen,
    openSettings,
    closeSettings,
    openDebug,
    closeDebug,
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenFeedback,
    handleCheckBackendHealth,
    setAssistantState,
  } = panel;

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
        <PanelHeader title="Livepair">
          {showStateDevControls ? (
            <Button variant="ghost" size="sm" onClick={openDebug} aria-label="Developer tools">
              <Bug size={16} />
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={openSettings} aria-label="Settings">
            <Settings size={16} />
          </Button>
        </PanelHeader>

        <AssistantPanelStateHero state={assistantState} />

        <section className="assistant-panel__conversation" aria-labelledby="assistant-panel-conversation-title">
          <div className="assistant-panel__conversation-header">
            <h3 id="assistant-panel-conversation-title" className="assistant-panel__conversation-title">
              Conversation
            </h3>
            <p className="assistant-panel__conversation-hint">{CONVERSATION_HINTS[assistantState]}</p>
          </div>

          <div className="assistant-panel__conversation-card">
            <p className="assistant-panel__conversation-empty-title">No conversation yet</p>
            <p className="assistant-panel__conversation-empty-body">
              When you start talking, Livepair will keep the latest exchange here so you can stay oriented in the flow.
            </p>
          </div>
        </section>

      </Panel>

      <AssistantPanelSettingsModal isOpen={isSettingsOpen} onClose={closeSettings} />
      {showStateDevControls ? (
        <AssistantPanelDebugModal
          isOpen={isDebugOpen}
          assistantState={assistantState}
          backendState={backendState}
          backendIndicatorState={backendIndicatorState}
          backendLabel={backendLabel}
          tokenFeedback={tokenFeedback}
          onClose={closeDebug}
          onRetryBackendHealth={handleCheckBackendHealth}
          onSetAssistantState={setAssistantState}
        />
      ) : null}
    </OverlayContainer>
  );
}
