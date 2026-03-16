import { contextBridge, ipcRenderer } from 'electron';
import {
  getOverlayMode,
  IPC_CHANNELS,
  type DesktopBridge,
} from '../shared';

export const bridge: DesktopBridge = {
  overlayMode: getOverlayMode(process.platform),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  checkHealth: () => ipcRenderer.invoke(IPC_CHANNELS.checkHealth),
  requestSessionToken: (req) => ipcRenderer.invoke(IPC_CHANNELS.requestSessionToken, req),
  searchProjectKnowledge: (req) => ipcRenderer.invoke(IPC_CHANNELS.searchProjectKnowledge, req),
  reportLiveTelemetry: (events) => ipcRenderer.invoke(IPC_CHANNELS.reportLiveTelemetry, events),
  createChat: (req) => ipcRenderer.invoke(IPC_CHANNELS.createChat, req),
  getChat: (chatId) => ipcRenderer.invoke(IPC_CHANNELS.getChat, chatId),
  getCurrentChat: () => ipcRenderer.invoke(IPC_CHANNELS.getCurrentChat),
  getOrCreateCurrentChat: () => ipcRenderer.invoke(IPC_CHANNELS.getOrCreateCurrentChat),
  listChats: () => ipcRenderer.invoke(IPC_CHANNELS.listChats),
  listChatMessages: (chatId, options) =>
    typeof options === 'undefined'
      ? ipcRenderer.invoke(IPC_CHANNELS.listChatMessages, chatId)
      : ipcRenderer.invoke(IPC_CHANNELS.listChatMessages, chatId, options),
  getChatSummary: (chatId) => ipcRenderer.invoke(IPC_CHANNELS.getChatSummary, chatId),
  appendChatMessage: (req) => ipcRenderer.invoke(IPC_CHANNELS.appendChatMessage, req),
  createLiveSession: (req) => ipcRenderer.invoke(IPC_CHANNELS.createLiveSession, req),
  listLiveSessions: (chatId, options) =>
    typeof options === 'undefined'
      ? ipcRenderer.invoke(IPC_CHANNELS.listLiveSessions, chatId)
      : ipcRenderer.invoke(IPC_CHANNELS.listLiveSessions, chatId, options),
  updateLiveSession: (req) => ipcRenderer.invoke(IPC_CHANNELS.updateLiveSession, req),
  endLiveSession: (req) => ipcRenderer.invoke(IPC_CHANNELS.endLiveSession, req),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  updateSettings: (patch) => ipcRenderer.invoke(IPC_CHANNELS.updateSettings, patch),
  setOverlayHitRegions: (regions) => ipcRenderer.invoke(IPC_CHANNELS.setOverlayHitRegions, regions),
  setOverlayPointerPassthrough: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.setOverlayPointerPassthrough, enabled),
  getScreenCaptureAccessStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getScreenCaptureAccessStatus),
  listScreenCaptureSources: () => ipcRenderer.invoke(IPC_CHANNELS.listScreenCaptureSources),
  selectScreenCaptureSource: (sourceId) =>
    ipcRenderer.invoke(IPC_CHANNELS.selectScreenCaptureSource, sourceId),
  startScreenFrameDumpSession: () => ipcRenderer.invoke(IPC_CHANNELS.startScreenFrameDumpSession),
  saveScreenFrameDumpFrame: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveScreenFrameDumpFrame, request),
};

contextBridge.exposeInMainWorld('bridge', bridge);
