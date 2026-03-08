import { AssistantPanel } from './components/features/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { useOverlayHitRegions } from './hooks/useOverlayHitRegions';
import { UiStoreProvider } from './store/uiStore';

function AppShell(): JSX.Element {
  useOverlayHitRegions();

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
