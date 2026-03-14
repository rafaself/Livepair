export {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
  resolveBackendBaseUrl,
} from './backendBaseUrl';
export {
  IPC_CHANNELS,
  getOverlayMode,
  type DesktopBridge,
  type OverlayHitRegion,
  type OverlayMode,
  type ScreenCaptureAccessStatus,
  type ScreenCapturePermissionStatus,
  type ScreenCaptureSource,
  type ScreenCaptureSourceSnapshot,
} from './desktopBridge';
export {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeDesktopSettings,
  normalizeDesktopSettingsPatch,
  type DesktopSettings,
  type DesktopSettingsPatch,
  type PreferredMode,
  type SpeechSilenceTimeout,
  type ThemePreference,
} from './settings';
