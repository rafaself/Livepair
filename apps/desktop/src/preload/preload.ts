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
  startTextChatStream: async (req, onEvent) => {
    const { streamId } = await ipcRenderer.invoke(IPC_CHANNELS.startTextChatStream, req) as {
      streamId: string;
    };

    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        streamId: string;
        event: Parameters<typeof onEvent>[0];
      },
    ): void => {
      if (payload.streamId !== streamId) {
        return;
      }

      onEvent(payload.event);
    };

    ipcRenderer.on(IPC_CHANNELS.textChatEvent, listener);

    return {
      cancel: async () => {
        ipcRenderer.off(IPC_CHANNELS.textChatEvent, listener);
        await ipcRenderer.invoke(IPC_CHANNELS.cancelTextChatStream, { streamId });
      },
    };
  },
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch),
  setOverlayHitRegions: (regions) => ipcRenderer.invoke(IPC_CHANNELS.setOverlayHitRegions, regions),
  setOverlayPointerPassthrough: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOverlayPointerPassthrough, enabled),
};

contextBridge.exposeInMainWorld('bridge', bridge);
