import { useState } from 'react';
import { AssistantPanel } from './components/features/AssistantPanel';
import { Launcher } from './components/composite/Launcher';

export function App(): JSX.Element {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  function togglePanel(): void {
    setIsPanelOpen((current) => !current);
  }

  return (
    <div className="app-shell">
      <AssistantPanel isOpen={isPanelOpen} />
      <Launcher isPanelOpen={isPanelOpen} onToggle={togglePanel} />
    </div>
  );
}
