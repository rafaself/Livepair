import {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
} from './backendBaseUrl';

export type ThemePreference = 'system' | 'light' | 'dark';
export type PreferredMode = 'fast' | 'thinking';
export const PRIMARY_DISPLAY_ID = 'primary';

export type DesktopSettings = {
  themePreference: ThemePreference;
  backendUrl: string;
  preferredMode: PreferredMode;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  selectedCaptureDisplayId: string;
  selectedCaptureDisplayLabel?: string;
  selectedOverlayDisplayId: string;
  selectedOverlayDisplayLabel?: string;
  isPanelPinned: boolean;
};

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  themePreference: 'system',
  backendUrl: DEFAULT_API_BASE_URL,
  preferredMode: 'fast',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  selectedCaptureDisplayId: PRIMARY_DISPLAY_ID,
  selectedOverlayDisplayId: PRIMARY_DISPLAY_ID,
  isPanelPinned: false,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

function normalizePreferredMode(value: unknown): PreferredMode | null {
  return value === 'fast' || value === 'thinking' ? value : null;
}

export function normalizeDesktopSettings(
  settings: Partial<DesktopSettings>,
): DesktopSettings | null {
  const themePreference = normalizeThemePreference(
    settings.themePreference ?? DEFAULT_DESKTOP_SETTINGS.themePreference,
  );
  const backendUrl = normalizeBackendBaseUrl(
    settings.backendUrl ?? DEFAULT_DESKTOP_SETTINGS.backendUrl,
  );
  const preferredMode = normalizePreferredMode(
    settings.preferredMode ?? DEFAULT_DESKTOP_SETTINGS.preferredMode,
  );
  const selectedInputDeviceId =
    settings.selectedInputDeviceId ?? DEFAULT_DESKTOP_SETTINGS.selectedInputDeviceId;
  const selectedOutputDeviceId =
    settings.selectedOutputDeviceId ?? DEFAULT_DESKTOP_SETTINGS.selectedOutputDeviceId;
  const selectedCaptureDisplayId =
    settings.selectedCaptureDisplayId ?? DEFAULT_DESKTOP_SETTINGS.selectedCaptureDisplayId;
  const selectedOverlayDisplayId =
    settings.selectedOverlayDisplayId ?? DEFAULT_DESKTOP_SETTINGS.selectedOverlayDisplayId;
  const isPanelPinned = settings.isPanelPinned ?? DEFAULT_DESKTOP_SETTINGS.isPanelPinned;

  if (
    themePreference === null ||
    backendUrl === null ||
    preferredMode === null ||
    !isNonEmptyString(selectedInputDeviceId) ||
    !isNonEmptyString(selectedOutputDeviceId) ||
    !isNonEmptyString(selectedCaptureDisplayId) ||
    !isNonEmptyString(selectedOverlayDisplayId) ||
    typeof isPanelPinned !== 'boolean'
  ) {
    return null;
  }

  const result: DesktopSettings = {
    themePreference,
    backendUrl,
    preferredMode,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    selectedCaptureDisplayId,
    selectedOverlayDisplayId,
    isPanelPinned,
  };

  if (typeof settings.selectedCaptureDisplayLabel === 'string') {
    result.selectedCaptureDisplayLabel = settings.selectedCaptureDisplayLabel;
  }
  if (typeof settings.selectedOverlayDisplayLabel === 'string') {
    result.selectedOverlayDisplayLabel = settings.selectedOverlayDisplayLabel;
  }

  return result;
}

export function normalizeDesktopSettingsPatch(
  patch: DesktopSettingsPatch,
): DesktopSettingsPatch | null {
  const normalizedPatch: DesktopSettingsPatch = {};

  if ('themePreference' in patch) {
    const themePreference = normalizeThemePreference(patch.themePreference);
    if (themePreference === null) {
      return null;
    }
    normalizedPatch.themePreference = themePreference;
  }

  if ('backendUrl' in patch) {
    const backendUrl = normalizeBackendBaseUrl(patch.backendUrl);
    if (backendUrl === null) {
      return null;
    }
    normalizedPatch.backendUrl = backendUrl;
  }

  if ('preferredMode' in patch) {
    const preferredMode = normalizePreferredMode(patch.preferredMode);
    if (preferredMode === null) {
      return null;
    }
    normalizedPatch.preferredMode = preferredMode;
  }

  if ('selectedInputDeviceId' in patch) {
    if (!isNonEmptyString(patch.selectedInputDeviceId)) {
      return null;
    }
    normalizedPatch.selectedInputDeviceId = patch.selectedInputDeviceId;
  }

  if ('selectedOutputDeviceId' in patch) {
    if (!isNonEmptyString(patch.selectedOutputDeviceId)) {
      return null;
    }
    normalizedPatch.selectedOutputDeviceId = patch.selectedOutputDeviceId;
  }

  if ('selectedCaptureDisplayId' in patch) {
    if (!isNonEmptyString(patch.selectedCaptureDisplayId)) {
      return null;
    }
    normalizedPatch.selectedCaptureDisplayId = patch.selectedCaptureDisplayId;
  }

  if ('selectedOverlayDisplayId' in patch) {
    if (!isNonEmptyString(patch.selectedOverlayDisplayId)) {
      return null;
    }
    normalizedPatch.selectedOverlayDisplayId = patch.selectedOverlayDisplayId;
  }

  if ('selectedCaptureDisplayLabel' in patch) {
    if (typeof patch.selectedCaptureDisplayLabel === 'string') {
      normalizedPatch.selectedCaptureDisplayLabel = patch.selectedCaptureDisplayLabel;
    }
  }

  if ('selectedOverlayDisplayLabel' in patch) {
    if (typeof patch.selectedOverlayDisplayLabel === 'string') {
      normalizedPatch.selectedOverlayDisplayLabel = patch.selectedOverlayDisplayLabel;
    }
  }

  if ('isPanelPinned' in patch) {
    if (typeof patch.isPanelPinned !== 'boolean') {
      return null;
    }
    normalizedPatch.isPanelPinned = patch.isPanelPinned;
  }

  return normalizedPatch;
}
