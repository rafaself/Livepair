import './AssistantPanel.css';

export type AssistantPanelProps = {
  isOpen: boolean;
};

export function AssistantPanel({
  isOpen,
}: AssistantPanelProps): JSX.Element {
  return (
    <aside
      id="assistant-panel"
      role="complementary"
      aria-label="Assistant Panel"
      aria-hidden={!isOpen}
      className={`assistant-panel ${isOpen ? 'assistant-panel--open' : ''}`}
    >
      <div className="assistant-panel__content">Assistant Panel</div>
    </aside>
  );
}
