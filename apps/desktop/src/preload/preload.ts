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
  getBackendBaseUrl: () => ipcRenderer.invoke(IPC_CHANNELS.getBackendBaseUrl),
  setBackendBaseUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.setBackendBaseUrl, url),
  setOverlayHitRegions: (regions) => ipcRenderer.invoke(IPC_CHANNELS.setOverlayHitRegions, regions),
  setOverlayPointerPassthrough: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOverlayPointerPassthrough, enabled),
};

contextBridge.exposeInMainWorld('bridge', bridge);
