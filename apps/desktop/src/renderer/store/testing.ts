import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { useSessionStore } from './sessionStore';
import { useSettingsStore } from './settingsStore';
import { useUiStore } from './uiStore';

export function resetDesktopStores(): void {
  useSettingsStore.getState().reset();
  useUiStore.getState().reset();
  useSessionStore.getState().reset();
}

export function resetDesktopStoresWithDefaults(): void {
  resetDesktopStores();
  useSettingsStore.setState({
    settings: DEFAULT_DESKTOP_SETTINGS,
    isReady: true,
  });
}
