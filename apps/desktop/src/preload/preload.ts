import { contextBridge, ipcRenderer } from 'electron';
import type {
  HealthResponse,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

export interface DesktopBridge {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req?: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
}

export const bridge: DesktopBridge = {
  checkHealth: () => ipcRenderer.invoke('health:check'),
  requestSessionToken: (req) => ipcRenderer.invoke('session:requestToken', req),
};

contextBridge.exposeInMainWorld('bridge', bridge);
