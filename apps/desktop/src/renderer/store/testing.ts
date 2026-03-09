import { useSessionStore } from './sessionStore';
import { useSettingsStore } from './settingsStore';
import { useUiStore } from './uiStore';

export function resetDesktopStores(): void {
  useSettingsStore.getState().reset();
  useUiStore.getState().reset();
  useSessionStore.getState().reset();
}
