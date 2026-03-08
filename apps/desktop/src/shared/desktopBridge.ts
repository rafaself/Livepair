import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';

export type OverlayHitRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayMode = 'linux-shape' | 'forwarded-pointer';

export interface DesktopBridge {
  overlayMode: OverlayMode;
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  getBackendBaseUrl: () => Promise<string>;
  setBackendBaseUrl: (url: string) => Promise<string>;
  setOverlayHitRegions: (regions: OverlayHitRegion[]) => Promise<void>;
  setOverlayPointerPassthrough: (enabled: boolean) => Promise<void>;
}

export const IPC_CHANNELS = {
  checkHealth: 'health:check',
  requestSessionToken: 'session:requestToken',
  getBackendBaseUrl: 'config:getBackendBaseUrl',
  setBackendBaseUrl: 'config:setBackendBaseUrl',
  setOverlayHitRegions: 'overlay:setHitRegions',
  setOverlayPointerPassthrough: 'overlay:setPointerPassthrough',
} as const;

export function getOverlayMode(platform: string): OverlayMode {
  return platform === 'linux' ? 'linux-shape' : 'forwarded-pointer';
}
