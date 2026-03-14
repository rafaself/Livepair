import { useCallback, useEffect, useState } from 'react';
import type { ChatRecord, LiveSessionRecord } from '@livepair/shared-types';
import { OverlayContainer, Panel } from '../../layout';
import { AssistantPanelDebugView } from './debug/AssistantPanelDebugView';
import { AssistantPanelChatView } from './chat/AssistantPanelChatView';
import { AssistantPanelHeader } from './AssistantPanelHeader';
import { AssistantPanelHistoryView } from './history/AssistantPanelHistoryView';
import { AssistantPanelSettingsContent } from './settings/AssistantPanelSettingsView';
import { useAssistantPanelController } from './useAssistantPanelController';
import { useAssistantPanelSettingsController } from './settings/useAssistantPanelSettingsController';
import {
  createAndSwitchToNewChat,
  getChatRecord,
  switchToChat,
} from '../../../chatMemory';
import { getLatestPersistedLiveSession } from '../../../liveSessions';
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
  const [activeChat, setActiveChat] = useState<ChatRecord | null>(null);
  const [latestLiveSession, setLatestLiveSession] = useState<LiveSessionRecord | null>(null);
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
    handleStartSpeechModeWithScreen,
    handleEndSpeechMode,
    handleCheckBackendHealth,
  } = useAssistantPanelController();
  const settingsController = useAssistantPanelSettingsController();

  useEffect(() => {
    let isCancelled = false;

    if (activeChatId === null) {
      setActiveChat(null);
      setLatestLiveSession(null);
      return () => {
        isCancelled = true;
      };
    }

    void getChatRecord(activeChatId)
      .then((chat) => {
        if (!isCancelled) {
          setActiveChat(chat);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setActiveChat(null);
        }
      });

    void getLatestPersistedLiveSession(activeChatId)
      .then((liveSession) => {
        if (!isCancelled) {
          setLatestLiveSession(liveSession);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLatestLiveSession(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeChatId]);

  const handleSelectChat = useCallback(
    async (chatId: string): Promise<void> => {
      await switchToChat(chatId);
      setPanelView('chat');
    },
    [setPanelView],
  );
  const handleBackToHistory = useCallback((): void => {
    setPanelView('history');
  }, [setPanelView]);
  const handleBackToChat = useCallback((): void => {
    setPanelView('chat');
  }, [setPanelView]);
  const handleCreateChat = useCallback(async (): Promise<void> => {
    setLatestLiveSession(null);
    setPanelView('chat');
    setActiveChat(null);
    await createAndSwitchToNewChat();
  }, [setPanelView]);

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
              localUserSpeechActive={localUserSpeechActive}
              onBackToHistory={handleBackToHistory}
              onCreateChat={handleCreateChat}
              onDraftTextChange={handleDraftTextChange}
              onSubmitTextTurn={handleSubmitTextTurn}
              onStartSpeechMode={handleStartSpeechMode}
              onStartSpeechModeWithScreen={handleStartSpeechModeWithScreen}
              onEndSpeechMode={handleEndSpeechMode}
            />
          ) : null}

          {panelView === 'history' ? (
            <div className="assistant-panel__view-section">
              <AssistantPanelHistoryView
                activeChatId={activeChatId}
                onBackToChat={handleBackToChat}
                onSelectChat={handleSelectChat}
              />
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
                screenCaptureState={screenCaptureState}
                screenCaptureDiagnostics={screenCaptureDiagnostics}
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
