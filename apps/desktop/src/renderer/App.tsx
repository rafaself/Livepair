import { useState } from 'react';
import { AssistantPanel } from './components/features/AssistantPanel';
import { Launcher } from './components/composite/Launcher';
import type { AssistantPanelState } from './state/assistantUiState';

export function App(): JSX.Element {
  const [panelState, setPanelState] = useState<AssistantPanelState>('collapsed');
  const isPanelOpen = panelState === 'expanded';

  function togglePanel(): void {
    setPanelState((current) => (current === 'expanded' ? 'collapsed' : 'expanded'));
  }

  return (
    <div className="app-shell">
      <AssistantPanel panelState={panelState} showStateDevControls={import.meta.env.DEV} />
      <Launcher isPanelOpen={isPanelOpen} onToggle={togglePanel} />
    </div>
  );
}
