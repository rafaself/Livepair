import { useCallback } from 'react';
import { OverlayContainer, Panel } from '../../layout';
import { AssistantPanelDebugView } from './debug/AssistantPanelDebugView';
import { AssistantPanelChatView } from './chat/AssistantPanelChatView';
import { AssistantPanelHeader } from './AssistantPanelHeader';
import {
  AssistantPanelHistoryView,
  useAssistantPanelHistoryViewModel,
} from './history/AssistantPanelHistoryView';
import { AssistantPanelSettingsContent } from './settings/AssistantPanelSettingsView';
import { AssistantPanelPreferencesView } from './AssistantPanelPreferencesView';
import { useAssistantPanelController } from './useAssistantPanelController';
import { useAssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import { AssistantPanelSharedHeaderActions } from './AssistantPanelSharedHeaderActions';
import { useAssistantPanelSharedViewNavigation } from './useAssistantPanelSharedViewNavigation';
import { useAssistantPanelChatSessionData } from './chat/useAssistantPanelChatSessionData';
import { useDomainRuntimeHost } from '../../../runtime/domainRuntimeContract';
import { GeminiIcon } from '../../primitives';
import './AssistantPanel.css';

import { useUiStore } from '../../../store/uiStore';
import { useSessionStore } from '../../../store/sessionStore';

export type AssistantPanelProps = {
  screenShareModeGate?: (action: () => Promise<void>) => Promise<boolean | void>;
};

export function AssistantPanel({
  screenShareModeGate,
}: AssistantPanelProps = {}): JSX.Element {
  const isDebugMode = useUiStore((state) => state.isDebugMode);
  const {
    saveScreenFramesEnabled,
    screenFrameDumpDirectoryPath,
    setSaveScreenFramesEnabled,
  } = useDomainRuntimeHost();
  const activeChatId = useSessionStore((state) => state.activeChatId);
  const {
    assistantState,
    isPanelOpen,
    panelView,
    conversationTurns,
    isConversationEmpty,
    localUserSpeechActive,
    setPanelView,
    speechLifecycleStatus,
    isVoiceSessionActive,
    canToggleScreenContext,
    isScreenCaptureActive,
    canEndSpeechMode,
    sessionActionKind,
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
  } = useAssistantPanelController(
    screenShareModeGate ? { screenShareModeGate } : {},
  );
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

  const handleCreateOrReturnToChat = useCallback(async (): Promise<void> => {
    if (canCreateAnotherChat) {
      await handleCreateChat();
    } else {
      handleBackToChat();
    }
  }, [canCreateAnotherChat, handleCreateChat, handleBackToChat]);

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
          localUserSpeechActive={localUserSpeechActive}
          speechLifecycleStatus={speechLifecycleStatus}
        />
        <div className="assistant-panel__view">
          {isSharedInnerView ? (
            <div className="assistant-panel__inner-shell">
              <div className="assistant-panel__inner-header">
                <AssistantPanelSharedHeaderActions
                  panelView={panelView}
                  showHistory={panelView === 'chat'}
                  showCreateChat={panelView === 'history' || canCreateAnotherChat}
                  showBackToChat={panelView === 'history'}
                  onCreateChat={handleCreateOrReturnToChat}
                  onOpenHistory={handleBackToHistory}
                  onBackToChat={handleBackToChat}
                />
              </div>
              <div className="assistant-panel__inner-body">
                {panelView === 'chat' ? (
                  <AssistantPanelChatView
                    assistantState={assistantState}
                    isPanelOpen={isPanelOpen}
                    speechLifecycleStatus={speechLifecycleStatus}
                    canSubmitText={canSubmitText}
                    canEndSpeechMode={canEndSpeechMode}
                    sessionActionKind={sessionActionKind}
                    activeChat={activeChat}
                    latestLiveSession={latestLiveSession}
                    turns={conversationTurns}
                    isConversationEmpty={isConversationEmpty}
                    isVoiceSessionActive={isVoiceSessionActive}
                    canToggleScreenContext={canToggleScreenContext}
                    isScreenCaptureActive={isScreenCaptureActive}
                    lastRuntimeError={lastRuntimeError}
                    draftText={draftText}
                    isSubmittingTextTurn={isSubmittingTextTurn}
                     isComposerMicrophoneEnabled={isComposerMicrophoneEnabled}
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

          {panelView === 'preferences' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelPreferencesView controller={settingsController} />
            </div>
          ) : null}

          {(panelView === 'debug' && isDebugMode) ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelDebugView
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
        <div className="assistant-panel__footer">
          <span>Powered by</span>
          <GeminiIcon size={14} className="assistant-panel__footer-icon" />
          <span className="assistant-panel__footer-brand">Gemini</span>
        </div>
      </Panel>
    </OverlayContainer>
  );
}
