import { contextBridge, ipcRenderer } from 'electron';
import {
  getOverlayMode,
  IPC_CHANNELS,
  type DesktopBridge,
} from '../shared/desktopBridge';

export const bridge: DesktopBridge = {
  overlayMode: getOverlayMode(process.platform),
  checkHealth: () => ipcRenderer.invoke(IPC_CHANNELS.checkHealth),
  requestSessionToken: (req) => ipcRenderer.invoke(IPC_CHANNELS.requestSessionToken, req),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch),
  listDisplays: () => ipcRenderer.invoke(IPC_CHANNELS.listDisplays),
  setOverlayHitRegions: (regions) => ipcRenderer.invoke(IPC_CHANNELS.setOverlayHitRegions, regions),
  setOverlayPointerPassthrough: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOverlayPointerPassthrough, enabled),
  setOverlayInteractive: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOverlayInteractive, enabled),
  getOverlayWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.getOverlayWindowState),
  onOverlayWindowState: (listener) => {
    const handleOverlayWindowState = (_event: unknown, state: unknown): void => {
      listener(state as Awaited<ReturnType<DesktopBridge['getOverlayWindowState']>>);
    };

    ipcRenderer.on(IPC_CHANNELS.overlayWindowStateChanged, handleOverlayWindowState);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.overlayWindowStateChanged,
        handleOverlayWindowState,
      );
    };
  },
};

contextBridge.exposeInMainWorld('bridge', bridge);
