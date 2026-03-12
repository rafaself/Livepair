import type { CurrentVoiceTranscript } from '../../runtime/voice/voice.types';

export type AssistantPanelSpeechTranscriptProps = {
  currentVoiceTranscript: CurrentVoiceTranscript;
  show: boolean;
};

export function AssistantPanelSpeechTranscript({
  currentVoiceTranscript,
  show,
}: AssistantPanelSpeechTranscriptProps): JSX.Element | null {
  if (!show) {
    return null;
  }

  return (
    <section
      className="assistant-panel__voice-transcript"
      aria-label="Current speech turn transcript"
    >
      <h3 className="assistant-panel__voice-transcript-title">Current speech turn</h3>
      <div className="assistant-panel__voice-transcript-rows">
        <div className="assistant-panel__voice-transcript-row">
          <p className="assistant-panel__voice-transcript-label">You</p>
          <p className="assistant-panel__voice-transcript-body">
            {currentVoiceTranscript.user.text || 'Listening for your speech...'}
          </p>
        </div>
        <div className="assistant-panel__voice-transcript-row">
          <p className="assistant-panel__voice-transcript-label">Assistant</p>
          <p className="assistant-panel__voice-transcript-body">
            {currentVoiceTranscript.assistant.text || 'Waiting for the assistant response...'}
          </p>
        </div>
      </div>
    </section>
  );
}
