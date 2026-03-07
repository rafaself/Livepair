import { Mic, Server, Settings2, Wrench } from 'lucide-react';

export function AssistantPanelSettingsView(): JSX.Element {
  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <section className="assistant-panel__settings-section" aria-label="General">
          <div className="assistant-panel__section-header">
            <Settings2 size={13} color="var(--color-text-primary)" aria-hidden="true" />
            <h3 className="assistant-panel__settings-section-title">General</h3>
            <div className="assistant-panel__section-header-rule" />
          </div>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Preferred mode</dt>
              <dd className="assistant-panel__settings-value">Fast</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Audio">
          <div className="assistant-panel__section-header">
            <Mic size={13} color="var(--color-text-primary)" aria-hidden="true" />
            <h3 className="assistant-panel__settings-section-title">Audio</h3>
            <div className="assistant-panel__section-header-rule" />
          </div>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Input device</dt>
              <dd className="assistant-panel__settings-value">Default microphone</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Backend">
          <div className="assistant-panel__section-header">
            <Server size={13} color="var(--color-text-primary)" aria-hidden="true" />
            <h3 className="assistant-panel__settings-section-title">Backend</h3>
            <div className="assistant-panel__section-header-rule" />
          </div>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Backend URL</dt>
              <dd className="assistant-panel__settings-value">http://localhost:3000</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Advanced">
          <div className="assistant-panel__section-header">
            <Wrench size={13} color="var(--color-text-primary)" aria-hidden="true" />
            <h3 className="assistant-panel__settings-section-title">Advanced</h3>
            <div className="assistant-panel__section-header-rule" />
          </div>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Debug mode</dt>
              <dd className="assistant-panel__settings-value">Disabled</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
