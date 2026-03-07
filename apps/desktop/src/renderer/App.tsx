import { useState } from 'react';
import { AssistantPanel } from './components/features/AssistantPanel';
import { Launcher } from './components/composite/Launcher';

export function App(): JSX.Element {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function togglePanel(): void {
    setIsPanelOpen((current) => !current);
  }

  function closePanel(): void {
    setIsPanelOpen(false);
  }

  return (
    <div className="app-shell">
      <AssistantPanel isOpen={isPanelOpen} />
      <Launcher isPanelOpen={isPanelOpen} onToggle={togglePanel} />
    </div>
  );
}
