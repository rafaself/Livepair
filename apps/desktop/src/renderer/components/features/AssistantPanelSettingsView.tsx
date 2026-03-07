export function AssistantPanelSettingsView(): JSX.Element {
  return (
    <div className="assistant-panel__settings-modal">
      <h2 className="assistant-panel__settings-title">Settings</h2>

      <div className="assistant-panel__settings-body">
        <section className="assistant-panel__settings-section" aria-label="General">
          <h3 className="assistant-panel__settings-section-title">General</h3>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Preferred mode</dt>
              <dd className="assistant-panel__settings-value">Fast</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Audio">
          <h3 className="assistant-panel__settings-section-title">Audio</h3>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Input device</dt>
              <dd className="assistant-panel__settings-value">Default microphone</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Backend">
          <h3 className="assistant-panel__settings-section-title">Backend</h3>
          <dl className="assistant-panel__settings-list">
            <div className="assistant-panel__settings-item">
              <dt className="assistant-panel__settings-label">Backend URL</dt>
              <dd className="assistant-panel__settings-value">http://localhost:3000</dd>
            </div>
          </dl>
        </section>

        <section className="assistant-panel__settings-section" aria-label="Advanced">
          <h3 className="assistant-panel__settings-section-title">Advanced</h3>
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
