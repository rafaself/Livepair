import { AssistantPanel } from './components/features/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { UiStoreProvider } from './store/uiStore';

function AppShell(): JSX.Element {
  return (
    <div className="app-shell">
      <AssistantPanel showStateDevControls={import.meta.env.DEV} />
      <ControlDock />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <UiStoreProvider>
      <AppShell />
    </UiStoreProvider>
  );
}
