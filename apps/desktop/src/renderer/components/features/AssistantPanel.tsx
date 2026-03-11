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
    tokenFeedback,
    textSessionStatus,
    textSessionStatusLabel,
    voiceSessionStatus,
    voiceSessionResumption,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    screenCaptureState,
    screenCaptureDiagnostics,
    isVoiceSessionActive,
    currentVoiceTranscript,
    canSubmitText,
    lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn,
    handleCheckBackendHealth,
    setAssistantState,
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
              textSessionStatus={textSessionStatus}
              textSessionStatusLabel={textSessionStatusLabel}
              canSubmitText={canSubmitText}
              turns={conversationTurns}
              isVoiceSessionActive={isVoiceSessionActive}
              currentVoiceTranscript={currentVoiceTranscript}
              isConversationEmpty={isConversationEmpty}
              lastRuntimeError={lastRuntimeError}
              draftText={draftText}
              isSubmittingTextTurn={isSubmittingTextTurn}
              onDraftTextChange={handleDraftTextChange}
              onSubmitTextTurn={handleSubmitTextTurn}
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
                assistantState={assistantState}
                backendState={backendState}
                backendIndicatorState={backendIndicatorState}
                backendLabel={backendLabel}
                tokenFeedback={tokenFeedback}
                voiceSessionStatus={voiceSessionStatus}
                voiceSessionResumption={voiceSessionResumption}
                voiceCaptureState={voiceCaptureState}
                voiceCaptureDiagnostics={voiceCaptureDiagnostics}
                voicePlaybackState={voicePlaybackState}
                voicePlaybackDiagnostics={voicePlaybackDiagnostics}
                screenCaptureState={screenCaptureState}
                screenCaptureDiagnostics={screenCaptureDiagnostics}
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
