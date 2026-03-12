import { OverlayContainer, Panel } from '../layout';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';
import { AssistantPanelChatView } from './AssistantPanelChatView';
import { AssistantPanelHeader } from './AssistantPanelHeader';
import { AssistantPanelSettingsContent } from './AssistantPanelSettingsView';
import { useAssistantPanelController } from './useAssistantPanelController';
import { useAssistantPanelSettingsController } from './useAssistantPanelSettingsController';
import './AssistantPanel.css';

export type AssistantPanelProps = {
  showStateDevControls?: boolean;
};

export function AssistantPanel({
  showStateDevControls = false,
}: AssistantPanelProps): JSX.Element {
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
    currentMode,
    activeTransport,
    speechLifecycleStatus,
    tokenFeedback,
    textSessionStatus,
    voiceSessionStatus,
    voiceSessionResumption,
    voiceSessionDurability,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    voiceToolState,
    screenCaptureState,
    screenCaptureDiagnostics,
    canSubmitText,
    lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn,
    handleStartSpeechMode,
    handleEndSpeechMode,
    handleCheckBackendHealth,
  } = useAssistantPanelController();
  const settingsController = useAssistantPanelSettingsController();

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
        <AssistantPanelHeader
          panelView={panelView}
          setPanelView={setPanelView}
          showStateDevControls={showStateDevControls}
        />
        <div className="assistant-panel__view">
          {panelView === 'chat' ? (
            <AssistantPanelChatView
              assistantState={assistantState}
              currentMode={currentMode}
              isPanelOpen={isPanelOpen}
              speechLifecycleStatus={speechLifecycleStatus}
              textSessionStatus={textSessionStatus}
              canSubmitText={canSubmitText}
              activeTransport={activeTransport}
              voiceSessionStatus={voiceSessionStatus}
              turns={conversationTurns}
              isConversationEmpty={isConversationEmpty}
              lastRuntimeError={lastRuntimeError}
              draftText={draftText}
              isSubmittingTextTurn={isSubmittingTextTurn}
              onDraftTextChange={handleDraftTextChange}
              onSubmitTextTurn={handleSubmitTextTurn}
              onStartSpeechMode={handleStartSpeechMode}
              onEndSpeechMode={handleEndSpeechMode}
            />
          ) : null}

          {panelView === 'settings' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelSettingsContent controller={settingsController} />
            </div>
          ) : null}

          {(panelView === 'debug' && showStateDevControls) ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelDebugView
                backendState={backendState}
                backendIndicatorState={backendIndicatorState}
                backendLabel={backendLabel}
                tokenFeedback={tokenFeedback}
                voiceSessionStatus={voiceSessionStatus}
                voiceSessionResumption={voiceSessionResumption}
                voiceSessionDurability={voiceSessionDurability}
                voiceCaptureState={voiceCaptureState}
                voiceCaptureDiagnostics={voiceCaptureDiagnostics}
                voicePlaybackState={voicePlaybackState}
                voicePlaybackDiagnostics={voicePlaybackDiagnostics}
                voiceToolState={voiceToolState}
                screenCaptureState={screenCaptureState}
                screenCaptureDiagnostics={screenCaptureDiagnostics}
                onRetryBackendHealth={handleCheckBackendHealth}
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </OverlayContainer>
  );
}
