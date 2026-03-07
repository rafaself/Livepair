import { useState } from 'react';
import { AssistantPanel } from './components/AssistantPanel';
import { EdgeLauncher } from './components/EdgeLauncher';

export function App(): JSX.Element {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function togglePanel(): void {
    setIsPanelOpen((current) => !current);
  }

  return (
    <div className="app-shell">
      <AssistantPanel isOpen={isPanelOpen} />
      <EdgeLauncher isPanelOpen={isPanelOpen} onToggle={togglePanel} />
    </div>
  );
}
