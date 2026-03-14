import {
  AssistantPanelDebugAudioSection,
  type AssistantPanelDebugAudioSectionProps,
  AssistantPanelDebugConnectionSection,
  type AssistantPanelDebugConnectionSectionProps,
  AssistantPanelDebugOutboundGuardrailsSection,
  type AssistantPanelDebugOutboundGuardrailsSectionProps,
  AssistantPanelDebugScreenContextSection,
  type AssistantPanelDebugScreenContextSectionProps,
} from './AssistantPanelDebugSections';

export type AssistantPanelDebugViewProps = AssistantPanelDebugConnectionSectionProps
  & AssistantPanelDebugAudioSectionProps
  & AssistantPanelDebugOutboundGuardrailsSectionProps
  & AssistantPanelDebugScreenContextSectionProps;

export function AssistantPanelDebugView({
  backendState,
  backendIndicatorState,
  backendLabel,
  tokenFeedback,
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
  saveScreenFramesEnabled,
  screenFrameDumpDirectoryPath,
  onToggleSaveScreenFrames,
  onRetryBackendHealth,
}: AssistantPanelDebugViewProps): JSX.Element {
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
        voiceSessionResumption={voiceSessionResumption}
        voiceSessionDurability={voiceSessionDurability}
        voiceCaptureState={voiceCaptureState}
        voiceCaptureDiagnostics={voiceCaptureDiagnostics}
        voicePlaybackState={voicePlaybackState}
        voicePlaybackDiagnostics={voicePlaybackDiagnostics}
        voiceToolState={voiceToolState}
      />

      <AssistantPanelDebugOutboundGuardrailsSection
        realtimeOutboundDiagnostics={realtimeOutboundDiagnostics}
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
