import {
  AssistantPanelDebugAudioSection,
  AssistantPanelDebugConnectionSection,
  AssistantPanelDebugLiveSignalsSection,
  AssistantPanelDebugOutboundGuardrailsSection,
  AssistantPanelDebugSpeechChatDiagnosticsSection,
  AssistantPanelDebugScreenContextSection,
} from './AssistantPanelDebugSections';
import {
  useLiveRuntimeDiagnosticsSnapshot,
} from '../../../../runtime/liveRuntime';

export type AssistantPanelDebugViewProps = {
  saveScreenFramesEnabled: boolean;
  screenFrameDumpDirectoryPath: string | null;
  onToggleSaveScreenFrames: () => void;
  onRetryBackendHealth: () => Promise<void>;
};

export function AssistantPanelDebugView({
  saveScreenFramesEnabled,
  screenFrameDumpDirectoryPath,
  onToggleSaveScreenFrames,
  onRetryBackendHealth,
}: AssistantPanelDebugViewProps): JSX.Element {
  const {
    backendState,
    backendIndicatorState,
    backendLabel,
    tokenFeedback,
    voiceSessionStatus,
    activeVoiceSessionGroundingEnabled,
    effectiveVoiceSessionCapabilities,
    voiceSessionLatency,
    voiceSessionResumption,
    voiceSessionDurability,
    voiceTranscriptDiagnostics,
    ignoredAssistantOutputDiagnostics,
    voiceSessionRecoveryDiagnostics,
    voiceCaptureState,
    voiceCaptureDiagnostics,
    voicePlaybackState,
    voicePlaybackDiagnostics,
    voiceToolState,
    voiceLiveSignalDiagnostics,
    realtimeOutboundDiagnostics,
    screenCaptureState,
    screenCaptureDiagnostics,
    visualSendDiagnostics,
  } = useLiveRuntimeDiagnosticsSnapshot();

  return (
    <div className="assistant-panel__debug-modal">
      <h2 className="assistant-panel__debug-title">Developer tools</h2>

      <AssistantPanelDebugConnectionSection
        backendState={backendState}
        backendIndicatorState={backendIndicatorState}
        backendLabel={backendLabel}
        tokenFeedback={tokenFeedback}
        onRetryBackendHealth={onRetryBackendHealth}
      />

      <AssistantPanelDebugAudioSection
        voiceSessionStatus={voiceSessionStatus}
        voiceSessionLatency={voiceSessionLatency}
        voiceSessionResumption={voiceSessionResumption}
        voiceSessionDurability={voiceSessionDurability}
        voiceCaptureState={voiceCaptureState}
        voiceCaptureDiagnostics={voiceCaptureDiagnostics}
        voicePlaybackState={voicePlaybackState}
        voicePlaybackDiagnostics={voicePlaybackDiagnostics}
        voiceToolState={voiceToolState}
      />

      <AssistantPanelDebugLiveSignalsSection
        voiceLiveSignalDiagnostics={voiceLiveSignalDiagnostics}
      />

      <AssistantPanelDebugOutboundGuardrailsSection
        realtimeOutboundDiagnostics={realtimeOutboundDiagnostics}
      />

      <AssistantPanelDebugSpeechChatDiagnosticsSection
        activeVoiceSessionGroundingEnabled={activeVoiceSessionGroundingEnabled}
        effectiveVoiceSessionCapabilities={effectiveVoiceSessionCapabilities}
        voiceTranscriptDiagnostics={voiceTranscriptDiagnostics}
        ignoredAssistantOutputDiagnostics={ignoredAssistantOutputDiagnostics}
        voiceSessionRecoveryDiagnostics={voiceSessionRecoveryDiagnostics}
      />

      <AssistantPanelDebugScreenContextSection
        screenCaptureState={screenCaptureState}
        screenCaptureDiagnostics={screenCaptureDiagnostics}
        visualSendDiagnostics={visualSendDiagnostics}
        saveScreenFramesEnabled={saveScreenFramesEnabled}
        screenFrameDumpDirectoryPath={screenFrameDumpDirectoryPath}
        onToggleSaveScreenFrames={onToggleSaveScreenFrames}
      />
    </div>
  );
}
