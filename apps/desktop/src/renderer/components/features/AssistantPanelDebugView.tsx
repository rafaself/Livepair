import { Eye, SlidersHorizontal, Wifi } from 'lucide-react';
import {
  ASSISTANT_RUNTIME_STATES,
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';
import type {
  VoiceCaptureDiagnostics,
  VoiceCaptureState,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
  VoiceSessionStatus,
} from '../../runtime/types';
import { FieldList, StatusIndicator } from '../composite';
import { ViewSection } from '../layout';
import { Button } from '../primitives';
import type { BackendConnectionState } from '../../store/sessionStore';
import { AssistantPanelStateHero } from './AssistantPanelStateHero';

export type AssistantPanelDebugViewProps = {
  assistantState: AssistantRuntimeState;
  backendState: BackendConnectionState;
  backendIndicatorState: AssistantRuntimeState;
  backendLabel: string;
  tokenFeedback: string | null;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  voiceCaptureDiagnostics: VoiceCaptureDiagnostics;
  voicePlaybackState: VoicePlaybackState;
  voicePlaybackDiagnostics: VoicePlaybackDiagnostics;
  onRetryBackendHealth: () => Promise<void>;
  onSetAssistantState: (state: AssistantRuntimeState) => void;
};

function formatVoiceCaptureState(state: VoiceCaptureState): string {
  if (state === 'requestingPermission') {
    return 'Requesting permission';
  }

  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatVoiceSessionStatus(state: VoiceSessionStatus): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function formatVoicePlaybackState(state: VoicePlaybackState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function AssistantPanelDebugView({
  assistantState,
  backendState,
  backendIndicatorState,
  backendLabel,
  tokenFeedback,
  voiceSessionStatus,
  voiceCaptureState,
  voiceCaptureDiagnostics,
  voicePlaybackState,
  voicePlaybackDiagnostics,
  onRetryBackendHealth,
  onSetAssistantState,
}: AssistantPanelDebugViewProps): JSX.Element {
  return (
    <div className="assistant-panel__debug-modal">
      <h2 className="assistant-panel__debug-title">Developer tools</h2>

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
                  <span>{backendState.charAt(0).toUpperCase() + backendState.slice(1)}</span>
                </>
              ),
            },
            { label: 'Token request', value: tokenFeedback ?? 'Idle' },
            { label: 'Mode', value: 'Fast' },
            {
              label: 'Assistant state',
              value: (
                <>
                  <StatusIndicator state={assistantState} size="sm" />
                  <span>{ASSISTANT_RUNTIME_STATE_LABELS[assistantState]}</span>
                </>
              ),
            },
          ]}
        />
        {backendState === 'failed' ? (
          <Button variant="secondary" size="sm" onClick={() => void onRetryBackendHealth()}>
            Retry backend
          </Button>
        ) : null}
      </ViewSection>

      <ViewSection icon={Eye} title="Audio">
        <FieldList
          items={[
            { label: 'Voice session', value: formatVoiceSessionStatus(voiceSessionStatus) },
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

      <ViewSection icon={Eye} title="Preview">
        <AssistantPanelStateHero state={assistantState} />
      </ViewSection>

      <ViewSection icon={SlidersHorizontal} title="Set assistant state">
        <div className="assistant-panel__debug-state-buttons">
          {ASSISTANT_RUNTIME_STATES.map((state) => (
            <Button
              key={state}
              variant={assistantState === state ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onSetAssistantState(state)}
            >
              {state}
            </Button>
          ))}
        </div>
      </ViewSection>
    </div>
  );
}
