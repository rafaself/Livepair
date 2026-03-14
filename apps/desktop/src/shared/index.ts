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
  type SaveScreenFrameDumpFrameRequest,
  type ScreenCaptureAccessStatus,
  type ScreenCapturePermissionStatus,
  type ScreenFrameDumpSessionInfo,
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
  type VisualSessionQuality,
} from './settings';
