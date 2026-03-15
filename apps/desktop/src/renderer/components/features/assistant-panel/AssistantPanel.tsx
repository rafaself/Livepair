import { OverlayContainer, Panel } from '../../layout';
import { AssistantPanelDebugView } from './debug/AssistantPanelDebugView';
import { AssistantPanelChatView } from './chat/AssistantPanelChatView';
import { AssistantPanelHeader } from './AssistantPanelHeader';
import {
  AssistantPanelHistoryView,
  useAssistantPanelHistoryViewModel,
} from './history/AssistantPanelHistoryView';
import { AssistantPanelSettingsContent } from './settings/AssistantPanelSettingsView';
import { useAssistantPanelController } from './useAssistantPanelController';
import { useAssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { AssistantPanelSharedHeaderActions } from './AssistantPanelSharedHeaderActions';
import { useAssistantPanelSharedViewNavigation } from './useAssistantPanelSharedViewNavigation';
import { useAssistantPanelChatSessionData } from './chat/useAssistantPanelChatSessionData';
import './AssistantPanel.css';

import { useUiStore } from '../../../store/uiStore';
import { useSessionStore } from '../../../store/sessionStore';

export function AssistantPanel(): JSX.Element {
  const isDebugMode = useUiStore((state) => state.isDebugMode);
  const saveScreenFramesEnabled = useUiStore((state) => state.saveScreenFramesEnabled);
  const screenFrameDumpDirectoryPath = useUiStore(
    (state) => state.screenFrameDumpDirectoryPath,
  );
  const setSaveScreenFramesEnabled = useUiStore(
    (state) => state.setSaveScreenFramesEnabled,
  );
  const activeChatId = useSessionStore((state) => state.activeChatId);
  const localUserSpeechActive = useSessionStore((state) => state.localUserSpeechActive);
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
    realtimeOutboundDiagnostics,
    screenCaptureState,
    screenCaptureDiagnostics,
    visualSendDiagnostics,
    canSubmitText,
    lastRuntimeError,
    draftText,
    isSubmittingTextTurn,
    isComposerMicrophoneEnabled,
    handleDraftTextChange,
    handleSubmitTextTurn,
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
    handleCheckBackendHealth,
  } = useAssistantPanelController();
  const settingsController = useAssistantPanelSettingsController();
  const isSharedInnerView = panelView === 'chat' || panelView === 'history';
  const historyViewModel = useAssistantPanelHistoryViewModel({
    activeChatId,
    isEnabled: panelView === 'history',
  });
  const {
    activeChat,
    latestLiveSession,
    resetChatSessionData,
  } = useAssistantPanelChatSessionData({
    activeChatId,
  });
  const hasCreatedChatSession =
    activeChatId !== null || activeChat !== null || latestLiveSession !== null;
  const canCreateAnotherChat = hasCreatedChatSession && !isConversationEmpty;
  const {
    handleSelectChat,
    handleBackToHistory,
    handleBackToChat,
    handleCreateChat,
  } = useAssistantPanelSharedViewNavigation({
    setPanelView,
    resetChatSessionData,
  });

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
          isDebugMode={isDebugMode}
        />
        <div className="assistant-panel__view">
          {isSharedInnerView ? (
            <div className="assistant-panel__inner-shell">
              <div className="assistant-panel__inner-header">
                <AssistantPanelSharedHeaderActions
                  panelView={panelView}
                  showHistory={panelView === 'chat'}
                  showCreateChat={canCreateAnotherChat}
                  showBackToChat={panelView === 'history'}
                  onCreateChat={handleCreateChat}
                  onOpenHistory={handleBackToHistory}
                  onBackToChat={handleBackToChat}
                />
              </div>
              <div className="assistant-panel__inner-body">
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
                    voiceSessionResumption={voiceSessionResumption}
                    activeChat={activeChat}
                    latestLiveSession={latestLiveSession}
                    turns={conversationTurns}
                    isConversationEmpty={isConversationEmpty}
                     lastRuntimeError={lastRuntimeError}
                     draftText={draftText}
                     isSubmittingTextTurn={isSubmittingTextTurn}
                     isComposerMicrophoneEnabled={isComposerMicrophoneEnabled}
                     screenCaptureState={screenCaptureState}
                     inputDeviceOptions={settingsController.inputDeviceOptions}
                     localUserSpeechActive={localUserSpeechActive}
                     screenCaptureSourceOptions={settingsController.screenCaptureSourceOptions}
                     selectedInputDeviceId={settingsController.selectedInputDeviceId}
                     selectedScreenCaptureSourceId={settingsController.selectedScreenCaptureSourceId}
                     onDraftTextChange={handleDraftTextChange}
                     onSubmitTextTurn={handleSubmitTextTurn}
                     onSelectComposerInputDevice={settingsController.setSelectedInputDeviceId}
                     onSelectComposerScreenSource={
                       settingsController.setSelectedScreenCaptureSourceId
                     }
                     onStartSpeechMode={handleStartSpeechMode}
                     onStartSpeechModeWithScreen={handleStartSpeechModeWithScreen}
                     onToggleComposerMicrophone={handleToggleComposerMicrophone}
                     onToggleComposerScreenShare={handleToggleComposerScreenShare}
                     onEndSpeechMode={handleEndSpeechMode}
                    />
                 ) : (
                  <AssistantPanelHistoryView
                    activeChatId={activeChatId}
                    onSelectChat={handleSelectChat}
                    viewModel={historyViewModel}
                  />
                )}
              </div>
            </div>
          ) : null}

          {panelView === 'settings' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelSettingsContent controller={settingsController} />
            </div>
          ) : null}

          {(panelView === 'debug' && isDebugMode) ? (
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
                realtimeOutboundDiagnostics={realtimeOutboundDiagnostics}
                screenCaptureState={screenCaptureState}
                screenCaptureDiagnostics={screenCaptureDiagnostics}
                visualSendDiagnostics={visualSendDiagnostics}
                saveScreenFramesEnabled={saveScreenFramesEnabled}
                screenFrameDumpDirectoryPath={screenFrameDumpDirectoryPath}
                onToggleSaveScreenFrames={() => {
                  setSaveScreenFramesEnabled(!saveScreenFramesEnabled);
                }}
                onRetryBackendHealth={handleCheckBackendHealth}
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </OverlayContainer>
  );
}
