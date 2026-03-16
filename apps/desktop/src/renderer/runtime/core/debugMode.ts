import { useUiStore } from '../../store/uiStore';

export function isRuntimeDebugModeEnabled(): boolean {
  return useUiStore.getState().isDebugMode;
}
