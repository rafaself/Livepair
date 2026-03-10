import {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
} from './backendBaseUrl';

export type ThemePreference = 'system' | 'light' | 'dark';
export type PreferredMode = 'fast';

export type DesktopSettings = {
  themePreference: ThemePreference;
  backendUrl: string;
  preferredMode: PreferredMode;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  isPanelPinned: boolean;
};

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  themePreference: 'system',
  backendUrl: DEFAULT_API_BASE_URL,
  preferredMode: 'fast',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  isPanelPinned: false,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

function normalizePreferredMode(value: unknown): PreferredMode | null {
  if (value === 'fast') return value;
  if (value === 'thinking') return 'fast';
  return null;
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
  const isPanelPinned = settings.isPanelPinned ?? DEFAULT_DESKTOP_SETTINGS.isPanelPinned;

  if (
    themePreference === null ||
    backendUrl === null ||
    preferredMode === null ||
    !isNonEmptyString(selectedInputDeviceId) ||
    !isNonEmptyString(selectedOutputDeviceId) ||
    typeof isPanelPinned !== 'boolean'
  ) {
    return null;
  }

  return {
    themePreference,
    backendUrl,
    preferredMode,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    isPanelPinned,
  };
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

  if ('isPanelPinned' in patch) {
    if (typeof patch.isPanelPinned !== 'boolean') {
      return null;
    }
    normalizedPatch.isPanelPinned = patch.isPanelPinned;
  }

  return normalizedPatch;
}
