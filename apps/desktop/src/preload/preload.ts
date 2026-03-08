import { contextBridge, ipcRenderer } from 'electron';
import type {
  HealthResponse,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

export type OverlayHitRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface DesktopBridge {
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  setOverlayHitRegions: (regions: OverlayHitRegion[]) => Promise<void>;
}

export const bridge: DesktopBridge = {
  checkHealth: () => ipcRenderer.invoke('health:check'),
  requestSessionToken: (req) => ipcRenderer.invoke('session:requestToken', req),
  setOverlayHitRegions: (regions) => ipcRenderer.invoke('overlay:setHitRegions', regions),
};

contextBridge.exposeInMainWorld('bridge', bridge);
