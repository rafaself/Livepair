import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  HealthResponse,
} from '@livepair/shared-types';
import type {
  DesktopSettings,
  DesktopSettingsPatch,
} from './settings';

export type DesktopDisplayOption = {
  id: string;
  label: string;
  isPrimary: boolean;
};

export type OverlayHitRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayMode = 'linux-shape' | 'forwarded-pointer';
export type OverlayWindowState = {
  isFocused: boolean;
  isVisible: boolean;
  isInteractive: boolean;
};
export type OverlayWindowStateListener = (state: OverlayWindowState) => void;

export interface DesktopBridge {
  overlayMode: OverlayMode;
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
  listDisplays: () => Promise<DesktopDisplayOption[]>;
  setOverlayHitRegions: (regions: OverlayHitRegion[]) => Promise<void>;
  setOverlayPointerPassthrough: (enabled: boolean) => Promise<void>;
  setOverlayInteractive: (enabled: boolean) => Promise<void>;
  getOverlayWindowState: () => Promise<OverlayWindowState>;
  onOverlayWindowState: (listener: OverlayWindowStateListener) => () => void;
}

export const IPC_CHANNELS = {
  checkHealth: 'health:check',
  requestSessionToken: 'session:requestToken',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  listDisplays: 'displays:list',
  setOverlayHitRegions: 'overlay:setHitRegions',
  setOverlayPointerPassthrough: 'overlay:setPointerPassthrough',
  setOverlayInteractive: 'overlay:setInteractive',
  getOverlayWindowState: 'overlay:getWindowState',
  overlayWindowStateChanged: 'overlay:windowStateChanged',
} as const;

export function getOverlayMode(platform: string): OverlayMode {
  return platform === 'linux' ? 'linux-shape' : 'forwarded-pointer';
}
