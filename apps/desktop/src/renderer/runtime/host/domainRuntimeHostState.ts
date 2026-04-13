import { useSessionStore } from '../../store/sessionStore';
import { useUiStore } from '../../store/uiStore';
import type { ScreenCaptureSourceSnapshot } from '../../../shared';

function toErrorDetail(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}

export type DomainRuntimeHostStateSnapshot = {
  screenCaptureSources: ScreenCaptureSourceSnapshot['sources'];
  selectedScreenCaptureSourceId: string | null;
  saveScreenFramesEnabled: boolean;
  screenFrameDumpDirectoryPath: string | null;
};

export function useDomainRuntimeHostStateSnapshot(): DomainRuntimeHostStateSnapshot {
  const screenCaptureSources = useSessionStore((state) => state.screenCaptureSources);
  const selectedScreenCaptureSourceId = useSessionStore(
    (state) => state.selectedScreenCaptureSourceId,
  );
  const saveScreenFramesEnabled = useUiStore((state) => state.saveScreenFramesEnabled);
  const screenFrameDumpDirectoryPath = useUiStore(
    (state) => state.screenFrameDumpDirectoryPath,
  );

  return {
    screenCaptureSources,
    selectedScreenCaptureSourceId,
    saveScreenFramesEnabled,
    screenFrameDumpDirectoryPath,
  };
}

export async function refreshDomainRuntimeScreenCaptureSources(): Promise<boolean> {
  try {
    const snapshot = await window.bridge.listScreenCaptureSources();
    useSessionStore.getState().setScreenCaptureSourceSnapshot(snapshot);
    return true;
  } catch (error: unknown) {
    useSessionStore.getState().setLastRuntimeError(
      toErrorDetail(error, 'Failed to load screen capture sources'),
    );
    return false;
  }
}

export async function selectDomainRuntimeScreenCaptureSource(
  sourceId: string | null,
): Promise<boolean> {
  try {
    const snapshot = await window.bridge.selectScreenCaptureSource(sourceId);
    useSessionStore.getState().setScreenCaptureSourceSnapshot(snapshot);
    return true;
  } catch (error: unknown) {
    useSessionStore.getState().setLastRuntimeError(
      toErrorDetail(error, 'Failed to select screen capture source'),
    );
    return false;
  }
}

export function setDomainRuntimeSaveScreenFramesEnabled(enabled: boolean): void {
  useUiStore.getState().setSaveScreenFramesEnabled(enabled);
}
