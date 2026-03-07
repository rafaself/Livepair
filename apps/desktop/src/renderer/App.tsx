import { AssistantPanel } from './components/features/AssistantPanel';
import { Launcher } from './components/composite/Launcher';
import { UiStoreProvider } from './store/uiStore';

function AppShell(): JSX.Element {
  return (
    <div className="app-shell">
      <AssistantPanel showStateDevControls={import.meta.env.DEV} />
      <Launcher />
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
