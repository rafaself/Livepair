import { PanelSection } from '../layout';

export type AssistantPanelSessionSectionProps = Record<string, never>;

export function AssistantPanelSessionSection(
  _props: AssistantPanelSessionSectionProps,
): JSX.Element {
  return (
    <PanelSection title="Session" className="assistant-panel__session">
      <dl className="assistant-panel__session-list">
        <div className="assistant-panel__session-item">
          <dt className="assistant-panel__session-label">Mode</dt>
          <dd className="assistant-panel__session-value">Fast</dd>
        </div>
        <div className="assistant-panel__session-item">
          <dt className="assistant-panel__session-label">Goal</dt>
          <dd className="assistant-panel__session-value">
            Assist with desktop tasks
          </dd>
        </div>
        <div className="assistant-panel__session-item">
          <dt className="assistant-panel__session-label">Transcript</dt>
          <dd className="assistant-panel__session-value">
            (No conversation yet)
          </dd>
        </div>
      </dl>
    </PanelSection>
  );
}
