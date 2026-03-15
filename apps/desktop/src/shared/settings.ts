import {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
} from './backendBaseUrl';

export type ThemePreference = 'system' | 'light' | 'dark';
export type PreferredMode = 'fast';
export type SpeechSilenceTimeout = 'never' | '30s' | '3m';
export type VisualSessionQuality = 'Low' | 'Medium' | 'High';
export type ChatTimestampVisibility = 'hidden' | 'visible';
export type DesktopVoice = 'Puck' | 'Kore' | 'Aoede';

export const DEFAULT_SYSTEM_INSTRUCTION =
  'You are Livepair, a realtime multimodal desktop assistant.';
export const MAX_SYSTEM_INSTRUCTION_LENGTH = 1200;

export type DesktopSettings = {
  themePreference: ThemePreference;
  backendUrl: string;
  preferredMode: PreferredMode;
  speechSilenceTimeout: SpeechSilenceTimeout;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  voiceEchoCancellationEnabled: boolean;
  voiceNoiseSuppressionEnabled: boolean;
  voiceAutoGainControlEnabled: boolean;
  isPanelPinned: boolean;
  visualSessionQuality: VisualSessionQuality;
  chatTimestampVisibility: ChatTimestampVisibility;
  voice: DesktopVoice;
  systemInstruction: string;
};

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  themePreference: 'system',
  backendUrl: DEFAULT_API_BASE_URL,
  preferredMode: 'fast',
  speechSilenceTimeout: 'never',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  voiceEchoCancellationEnabled: true,
  voiceNoiseSuppressionEnabled: true,
  voiceAutoGainControlEnabled: true,
  isPanelPinned: false,
  visualSessionQuality: 'Low',
  chatTimestampVisibility: 'hidden',
  voice: 'Puck',
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

type StoredLegacyPreferredMode = 'thinking';

function normalizeStoredPreferredMode(
  value: PreferredMode | StoredLegacyPreferredMode | unknown,
): PreferredMode | null {
  if (value === 'fast') return value;
  if (value === 'thinking') return 'fast';
  return null;
}

function normalizeSpeechSilenceTimeout(value: unknown): SpeechSilenceTimeout | null {
  return value === 'never' || value === '30s' || value === '3m' ? value : null;
}

function normalizeVisualSessionQuality(value: unknown): VisualSessionQuality | null {
  return value === 'Low' || value === 'Medium' || value === 'High' ? value : null;
}

function normalizeChatTimestampVisibility(value: unknown): ChatTimestampVisibility | null {
  return value === 'hidden' || value === 'visible' ? value : null;
}

function normalizeDesktopVoice(value: unknown): DesktopVoice | null {
  return value === 'Puck' || value === 'Kore' || value === 'Aoede' ? value : null;
}

function normalizeSystemInstructionText(value: string): string {
  const normalized = value.trim().slice(0, MAX_SYSTEM_INSTRUCTION_LENGTH);

  return normalized.length > 0 ? normalized : DEFAULT_SYSTEM_INSTRUCTION;
}

export function resolveDesktopVoicePreference(value: unknown): DesktopVoice {
  return normalizeDesktopVoice(value) ?? DEFAULT_DESKTOP_SETTINGS.voice;
}

export function resolveSystemInstructionPreference(value: unknown): string {
  return typeof value === 'string'
    ? normalizeSystemInstructionText(value)
    : DEFAULT_SYSTEM_INSTRUCTION;
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
  const preferredMode = normalizeStoredPreferredMode(
    settings.preferredMode ?? DEFAULT_DESKTOP_SETTINGS.preferredMode,
  );
  const speechSilenceTimeout = normalizeSpeechSilenceTimeout(
    settings.speechSilenceTimeout ?? DEFAULT_DESKTOP_SETTINGS.speechSilenceTimeout,
  );
  const selectedInputDeviceId =
    settings.selectedInputDeviceId ?? DEFAULT_DESKTOP_SETTINGS.selectedInputDeviceId;
  const selectedOutputDeviceId =
    settings.selectedOutputDeviceId ?? DEFAULT_DESKTOP_SETTINGS.selectedOutputDeviceId;
  const voiceEchoCancellationEnabled =
    settings.voiceEchoCancellationEnabled
    ?? DEFAULT_DESKTOP_SETTINGS.voiceEchoCancellationEnabled;
  const voiceNoiseSuppressionEnabled =
    settings.voiceNoiseSuppressionEnabled
    ?? DEFAULT_DESKTOP_SETTINGS.voiceNoiseSuppressionEnabled;
  const voiceAutoGainControlEnabled =
    settings.voiceAutoGainControlEnabled
    ?? DEFAULT_DESKTOP_SETTINGS.voiceAutoGainControlEnabled;
  const isPanelPinned = settings.isPanelPinned ?? DEFAULT_DESKTOP_SETTINGS.isPanelPinned;
  const visualSessionQuality = normalizeVisualSessionQuality(
    settings.visualSessionQuality ?? DEFAULT_DESKTOP_SETTINGS.visualSessionQuality,
  );
  const chatTimestampVisibility = normalizeChatTimestampVisibility(
    settings.chatTimestampVisibility ?? DEFAULT_DESKTOP_SETTINGS.chatTimestampVisibility,
  );
  const voice = resolveDesktopVoicePreference(settings.voice);
  const systemInstruction = resolveSystemInstructionPreference(settings.systemInstruction);

  if (
    themePreference === null ||
    backendUrl === null ||
    preferredMode === null ||
    speechSilenceTimeout === null ||
    !isNonEmptyString(selectedInputDeviceId) ||
    !isNonEmptyString(selectedOutputDeviceId) ||
    typeof voiceEchoCancellationEnabled !== 'boolean' ||
    typeof voiceNoiseSuppressionEnabled !== 'boolean' ||
    typeof voiceAutoGainControlEnabled !== 'boolean' ||
    typeof isPanelPinned !== 'boolean' ||
    visualSessionQuality === null ||
    chatTimestampVisibility === null
  ) {
    return null;
  }

  return {
    themePreference,
    backendUrl,
    preferredMode,
    speechSilenceTimeout,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled,
    isPanelPinned,
    visualSessionQuality,
    chatTimestampVisibility,
    voice,
    systemInstruction,
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
    const preferredMode = normalizeStoredPreferredMode(patch.preferredMode);
    if (preferredMode === null) {
      return null;
    }
    normalizedPatch.preferredMode = preferredMode;
  }

  if ('speechSilenceTimeout' in patch) {
    const speechSilenceTimeout = normalizeSpeechSilenceTimeout(patch.speechSilenceTimeout);
    if (speechSilenceTimeout === null) {
      return null;
    }
    normalizedPatch.speechSilenceTimeout = speechSilenceTimeout;
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

  if ('voiceEchoCancellationEnabled' in patch) {
    if (typeof patch.voiceEchoCancellationEnabled !== 'boolean') {
      return null;
    }
    normalizedPatch.voiceEchoCancellationEnabled = patch.voiceEchoCancellationEnabled;
  }

  if ('voiceNoiseSuppressionEnabled' in patch) {
    if (typeof patch.voiceNoiseSuppressionEnabled !== 'boolean') {
      return null;
    }
    normalizedPatch.voiceNoiseSuppressionEnabled = patch.voiceNoiseSuppressionEnabled;
  }

  if ('voiceAutoGainControlEnabled' in patch) {
    if (typeof patch.voiceAutoGainControlEnabled !== 'boolean') {
      return null;
    }
    normalizedPatch.voiceAutoGainControlEnabled = patch.voiceAutoGainControlEnabled;
  }

  if ('isPanelPinned' in patch) {
    if (typeof patch.isPanelPinned !== 'boolean') {
      return null;
    }
    normalizedPatch.isPanelPinned = patch.isPanelPinned;
  }

  if ('visualSessionQuality' in patch) {
    const visualSessionQuality = normalizeVisualSessionQuality(patch.visualSessionQuality);
    if (visualSessionQuality === null) {
      return null;
    }
    normalizedPatch.visualSessionQuality = visualSessionQuality;
  }

  if ('chatTimestampVisibility' in patch) {
    const chatTimestampVisibility = normalizeChatTimestampVisibility(patch.chatTimestampVisibility);
    if (chatTimestampVisibility === null) {
      return null;
    }
    normalizedPatch.chatTimestampVisibility = chatTimestampVisibility;
  }

  if ('voice' in patch) {
    const voice = normalizeDesktopVoice(patch.voice);
    if (voice === null) {
      return null;
    }
    normalizedPatch.voice = voice;
  }

  if ('systemInstruction' in patch) {
    if (typeof patch.systemInstruction !== 'string') {
      return null;
    }
    normalizedPatch.systemInstruction = resolveSystemInstructionPreference(
      patch.systemInstruction,
    );
  }

  return normalizedPatch;
}
