import { Eye, Monitor, ShieldAlert, Wifi } from 'lucide-react';
import type { AssistantRuntimeState } from '../../../../state/assistantUiState';
import type {
  RealtimeOutboundDiagnostics,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
  VisualSendDiagnostics,
  VoiceCaptureDiagnostics,
  VoiceCaptureState,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionLatencyState,
  VoiceSessionDurabilityState,
  VoiceSessionResumptionState,
  VoiceSessionStatus,
  VoiceToolState,
} from '../../../../runtime';
import type { BackendConnectionState } from '../../../../store/sessionStore';
import { FieldList, StatusIndicator } from '../../../composite';
import { ViewSection } from '../../../layout';
import { Button, Switch } from '../../../primitives';
import {
  formatCapitalizedState,
  formatVoiceLatencyMetric,
  formatOutboundBreakerState,
  formatOutboundDecisionOutcome,
  formatOutboundDecisionReason,
  formatOverlayMaskReason,
  formatScreenCaptureState,
  formatVisualTransitionReason,
  formatVoiceCaptureState,
  formatVoicePlaybackState,
  formatVoiceSessionResumptionStatus,
  formatVoiceSessionStatus,
  formatVoiceToolState,
  truncateHandle,
} from './AssistantPanelDebugFormatters';

export type AssistantPanelDebugConnectionSectionProps = {
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenFeedback: string | null;
  onRetryBackendHealth: () => Promise<void>;
};

export function AssistantPanelDebugConnectionSection({
  backendState,
  backendIndicatorState,
  backendLabel,
  tokenFeedback,
  onRetryBackendHealth,
}: AssistantPanelDebugConnectionSectionProps): JSX.Element {
  return (
    <ViewSection icon={Wifi} title="Connection">
      <FieldList
        items={[
          {
            label: 'Backend status',
            value: (
              <>
                <StatusIndicator state={backendIndicatorState} size="sm" />
                <span>{backendLabel}</span>
              </>
            ),
          },
          {
            label: 'Backend lifecycle',
            value: (
              <>
                <StatusIndicator state={backendIndicatorState} size="sm" />
                <span>{formatCapitalizedState(backendState)}</span>
              </>
            ),
          },
          { label: 'Token request', value: tokenFeedback ?? 'Idle' },
          { label: 'Mode', value: 'Fast' },
        ]}
      />
      {backendState === 'failed' ? (
        <Button variant="secondary" size="sm" onClick={() => void onRetryBackendHealth()}>
          Retry backend
        </Button>
      ) : null}
    </ViewSection>
  );
}

export type AssistantPanelDebugAudioSectionProps = {
  voiceSessionStatus: VoiceSessionStatus;
  voiceSessionLatency: VoiceSessionLatencyState;
  voiceSessionResumption: VoiceSessionResumptionState;
  voiceSessionDurability: VoiceSessionDurabilityState;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  voiceToolState: VoiceToolState;
};

export function AssistantPanelDebugAudioSection({
  voiceSessionStatus,
  voiceSessionLatency,
  voiceSessionResumption,
  voiceSessionDurability,
  voiceCaptureState,
  voiceCaptureDiagnostics,
  voicePlaybackState,
  voicePlaybackDiagnostics,
  voiceToolState,
}: AssistantPanelDebugAudioSectionProps): JSX.Element {
  return (
    <ViewSection icon={Eye} title="Audio">
      <FieldList
        items={[
          { label: 'Voice session', value: formatVoiceSessionStatus(voiceSessionStatus) },
          {
            label: 'Connect latency',
            value: formatVoiceLatencyMetric(voiceSessionLatency.connect),
          },
          {
            label: 'First model response',
            value: formatVoiceLatencyMetric(voiceSessionLatency.firstModelResponse),
          },
          {
            label: 'Speech to response',
            value: formatVoiceLatencyMetric(voiceSessionLatency.speechToFirstModelResponse),
          },
          {
            label: 'Session resumption',
            value: formatVoiceSessionResumptionStatus(voiceSessionResumption.status),
          },
          {
            label: 'Resumable',
            value: voiceSessionResumption.resumable ? 'Yes' : 'No',
          },
          {
            label: 'Handle available',
            value: voiceSessionResumption.latestHandle ? 'Yes' : 'No',
          },
          {
            label: 'Latest handle',
            value: truncateHandle(voiceSessionResumption.latestHandle),
          },
          {
            label: 'Compression',
            value: voiceSessionDurability.compressionEnabled ? 'Enabled' : 'Disabled',
          },
          {
            label: 'Token valid',
            value: voiceSessionDurability.tokenValid ? 'Yes' : 'No',
          },
          {
            label: 'Token refreshing',
            value: voiceSessionDurability.tokenRefreshing ? 'Yes' : 'No',
          },
          {
            label: 'Token refresh failed',
            value: voiceSessionDurability.tokenRefreshFailed ? 'Yes' : 'No',
          },
          {
            label: 'Resumption detail',
            value: voiceSessionResumption.lastDetail ?? 'None',
          },
          {
            label: 'Durability detail',
            value: voiceSessionDurability.lastDetail ?? 'None',
          },
          { label: 'Tool state', value: formatVoiceToolState(voiceToolState.status) },
          { label: 'Current tool', value: voiceToolState.toolName ?? 'None' },
          { label: 'Tool call', value: voiceToolState.callId ?? 'None' },
          { label: 'Tool error', value: voiceToolState.lastError ?? 'None' },
          { label: 'Voice capture', value: formatVoiceCaptureState(voiceCaptureState) },
          {
            label: 'Audio format',
            value: voiceCaptureDiagnostics.sampleRateHz
              ? `${voiceCaptureDiagnostics.sampleRateHz / 1000} kHz / mono / pcm_s16le`
              : 'Not started',
          },
          {
            label: 'Chunk count',
            value: String(voiceCaptureDiagnostics.chunkCount),
          },
          {
            label: 'Chunk size',
            value: voiceCaptureDiagnostics.bytesPerChunk
              ? `${voiceCaptureDiagnostics.bytesPerChunk} bytes / ${voiceCaptureDiagnostics.chunkDurationMs ?? 0} ms`
              : 'Not started',
          },
          {
            label: 'Input device',
            value: voiceCaptureDiagnostics.selectedInputDeviceId ?? 'None',
          },
          {
            label: 'Capture error',
            value: voiceCaptureDiagnostics.lastError ?? 'None',
          },
          {
            label: 'Voice playback',
            value: formatVoicePlaybackState(voicePlaybackState),
          },
          {
            label: 'Playback output',
            value: voicePlaybackDiagnostics.selectedOutputDeviceId ?? 'None',
          },
          {
            label: 'Playback queue',
            value: String(voicePlaybackDiagnostics.queueDepth),
          },
          {
            label: 'Playback chunks',
            value: String(voicePlaybackDiagnostics.chunkCount),
          },
          {
            label: 'Playback format',
            value: voicePlaybackDiagnostics.sampleRateHz
              ? `${voicePlaybackDiagnostics.sampleRateHz / 1000} kHz / mono / pcm_s16le`
              : 'Not started',
          },
          {
            label: 'Playback error',
            value: voicePlaybackDiagnostics.lastError ?? 'None',
          },
        ]}
      />
    </ViewSection>
  );
}

export type AssistantPanelDebugOutboundGuardrailsSectionProps = {
  realtimeOutboundDiagnostics: RealtimeOutboundDiagnostics;
};

export function AssistantPanelDebugOutboundGuardrailsSection({
  realtimeOutboundDiagnostics,
}: AssistantPanelDebugOutboundGuardrailsSectionProps): JSX.Element {
  return (
    <ViewSection icon={ShieldAlert} title="Outbound guardrails">
      <FieldList
        items={[
          {
            label: 'Breaker',
            value: formatOutboundBreakerState(realtimeOutboundDiagnostics.breakerState),
          },
          {
            label: 'Breaker reason',
            value: realtimeOutboundDiagnostics.breakerReason ?? 'None',
          },
          {
            label: 'Submitted',
            value: String(realtimeOutboundDiagnostics.totalSubmitted),
          },
          {
            label: 'Text submits',
            value: String(realtimeOutboundDiagnostics.submittedByKind.text),
          },
          {
            label: 'Audio submits',
            value: String(realtimeOutboundDiagnostics.submittedByKind.audioChunk),
          },
          {
            label: 'Visual submits',
            value: String(realtimeOutboundDiagnostics.submittedByKind.visualFrame),
          },
          {
            label: 'Sent count',
            value: String(realtimeOutboundDiagnostics.sentCount),
          },
          {
            label: 'Dropped',
            value: String(realtimeOutboundDiagnostics.droppedCount),
          },
          {
            label: 'Dropped (stale)',
            value: String(realtimeOutboundDiagnostics.droppedByReason.staleSequence),
          },
          {
            label: 'Dropped (saturated)',
            value: String(realtimeOutboundDiagnostics.droppedByReason.laneSaturated),
          },
          {
            label: 'Replaced',
            value: String(realtimeOutboundDiagnostics.replacedCount),
          },
          {
            label: 'Blocked',
            value: String(realtimeOutboundDiagnostics.blockedCount),
          },
          {
            label: 'Blocked (breaker)',
            value: String(realtimeOutboundDiagnostics.blockedByReason.breakerOpen),
          },
          {
            label: 'Last decision',
            value: formatOutboundDecisionOutcome(realtimeOutboundDiagnostics.lastDecision),
          },
          {
            label: 'Last reason',
            value: formatOutboundDecisionReason(realtimeOutboundDiagnostics.lastReason),
          },
          {
            label: 'Last error',
            value: realtimeOutboundDiagnostics.lastError ?? 'None',
          },
        ]}
      />
    </ViewSection>
  );
}

export type AssistantPanelDebugScreenContextSectionProps = {
  screenCaptureState: ScreenCaptureState;
  screenCaptureDiagnostics: ScreenCaptureDiagnostics;
  visualSendDiagnostics: VisualSendDiagnostics;
  saveScreenFramesEnabled: boolean;
  screenFrameDumpDirectoryPath: string | null;
  onToggleSaveScreenFrames: () => void;
};

export function AssistantPanelDebugScreenContextSection({
  screenCaptureState,
  screenCaptureDiagnostics,
  visualSendDiagnostics,
  saveScreenFramesEnabled,
  screenFrameDumpDirectoryPath,
  onToggleSaveScreenFrames,
}: AssistantPanelDebugScreenContextSectionProps): JSX.Element {
  return (
    <ViewSection icon={Monitor} title="Share Screen">
      <FieldList
        items={[
          { label: 'Screen state', value: formatScreenCaptureState(screenCaptureState) },
          {
            label: 'Capture source',
            value: screenCaptureDiagnostics.captureSource ?? 'Unknown',
          },
          {
            label: 'Save screen frames',
            value: (
              <Switch
                aria-label="Save screen frames"
                checked={saveScreenFramesEnabled}
                className="assistant-panel__settings-switch"
                onCheckedChange={() => onToggleSaveScreenFrames()}
              />
            ),
          },
          ...(screenFrameDumpDirectoryPath
            ? [
                {
                  label: 'Saved frame dump',
                  value: screenFrameDumpDirectoryPath,
                },
              ]
            : []),
          {
            label: 'Frame rate',
            value: screenCaptureDiagnostics.frameRateHz
              ? `${screenCaptureDiagnostics.frameRateHz} fps`
              : 'Not started',
          },
          {
            label: 'Frame count',
            value: String(screenCaptureDiagnostics.frameCount),
          },
          {
            label: 'Frame size',
            value: screenCaptureDiagnostics.widthPx && screenCaptureDiagnostics.heightPx
              ? `${screenCaptureDiagnostics.widthPx} x ${screenCaptureDiagnostics.heightPx}`
              : 'Not started',
          },
          {
            label: 'Last frame',
            value: screenCaptureDiagnostics.lastFrameAt ?? 'None',
          },
          {
            label: 'Overlay mask active',
            value: screenCaptureDiagnostics.overlayMaskActive ? 'Yes' : 'No',
          },
          {
            label: 'Mask reason',
            value: formatOverlayMaskReason(screenCaptureDiagnostics.maskReason),
          },
          {
            label: 'Masked rects',
            value: String(screenCaptureDiagnostics.maskedRectCount),
          },
          {
            label: 'Last masked frame',
            value: screenCaptureDiagnostics.lastMaskedFrameAt ?? 'None',
          },
          {
            label: 'Last upload',
            value: formatCapitalizedState(screenCaptureDiagnostics.lastUploadStatus),
          },
          {
            label: 'Screen error',
            value: screenCaptureDiagnostics.lastError ?? 'None',
          },
          {
            label: 'Automatic cadence',
            value: `${visualSendDiagnostics.continuousCadenceMs} ms`,
          },
          {
            label: 'Last screen event',
            value: formatVisualTransitionReason(visualSendDiagnostics.lastEvent),
          },
          {
            label: 'Continuous active',
            value: visualSendDiagnostics.continuousActive ? 'Yes' : 'No',
          },
          {
            label: 'Manual frames sent',
            value: String(visualSendDiagnostics.manualFramesSentCount),
          },
          {
            label: 'Manual send pending',
            value: visualSendDiagnostics.manualSendPending ? 'Yes' : 'No',
          },
          {
            label: 'Last manual frame',
            value: visualSendDiagnostics.lastManualFrameAt ?? 'None',
          },
          {
            label: 'Continuous sharing started',
            value: visualSendDiagnostics.continuousStartedAt ?? 'None',
          },
          {
            label: 'Continuous sharing stopped',
            value: visualSendDiagnostics.continuousStoppedAt ?? 'None',
          },
          {
            label: 'Last continuous frame',
            value: visualSendDiagnostics.lastContinuousFrameAt ?? 'None',
          },
          {
            label: 'Sent (continuous)',
            value: String(visualSendDiagnostics.continuousFramesSentCount),
          },
          {
            label: 'Blocked (gateway)',
            value: String(visualSendDiagnostics.blockedByGateway),
          },
        ]}
      />
    </ViewSection>
  );
}
