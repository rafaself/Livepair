import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';

export function resetDesktopStores(): void {
  useCaptureExclusionRectsStore.getState().reset();
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
