import { PanelSection } from '../layout';
import { Button } from '../primitives';
import type { TokenRequestState } from './useAssistantPanelController';

export type AssistantPanelActionsSectionProps = {
  tokenRequestState: TokenRequestState;
  tokenFeedback: string | null;
  onConnect: () => Promise<void>;
  onStartListening: () => void;
};

export function AssistantPanelActionsSection({
  tokenRequestState,
  tokenFeedback,
  onConnect,
  onStartListening,
}: AssistantPanelActionsSectionProps): JSX.Element {
  return (
    <PanelSection title="Actions">
      <div className="assistant-panel__actions">
        <Button
          variant="primary"
          className="assistant-panel__action-primary"
          onClick={() => void onConnect()}
          disabled={tokenRequestState === 'loading'}
        >
          Connect
        </Button>
        <Button
          variant="secondary"
          className="assistant-panel__action-secondary"
          onClick={onStartListening}
        >
          Start Listening
        </Button>
      </div>
      {tokenFeedback ? (
        <p className="assistant-panel__actions-feedback" role="status" aria-live="polite">
          {tokenFeedback}
        </p>
      ) : null}
    </PanelSection>
  );
}
