import {
  DEFAULT_ASSISTANT_VOICE,
  DEFAULT_SYSTEM_INSTRUCTION,
  isAssistantVoice,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
  resolveAssistantVoicePreference,
  resolveSystemInstructionPreference,
  type AssistantVoice,
} from '@livepair/shared-types';

export {
  DEFAULT_SYSTEM_INSTRUCTION,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
  resolveSystemInstructionPreference,
};

export type ThemePreference = 'system' | 'light' | 'dark';
export type SpeechSilenceTimeout = 'never' | '30s' | '3m';
export type ScreenContextMode = 'unconfigured' | 'manual' | 'continuous';
export type ContinuousScreenQuality = 'low' | 'medium' | 'high';
export type ChatTimestampVisibility = 'hidden' | 'visible';
export type DesktopVoice = AssistantVoice;

export type DesktopSettings = {
  themePreference: ThemePreference;
  speechSilenceTimeout: SpeechSilenceTimeout;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  voiceEchoCancellationEnabled: boolean;
  voiceNoiseSuppressionEnabled: boolean;
  voiceAutoGainControlEnabled: boolean;
  isPanelPinned: boolean;
  screenContextMode: ScreenContextMode;
  continuousScreenQuality: ContinuousScreenQuality;
  chatTimestampVisibility: ChatTimestampVisibility;
  groundingEnabled: boolean;
  voice: DesktopVoice;
  systemInstruction: string;
};

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  themePreference: 'system',
  speechSilenceTimeout: '3m',
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  voiceEchoCancellationEnabled: true,
  voiceNoiseSuppressionEnabled: true,
  voiceAutoGainControlEnabled: true,
  isPanelPinned: false,
  screenContextMode: 'unconfigured',
  continuousScreenQuality: 'medium',
  chatTimestampVisibility: 'hidden',
  groundingEnabled: false,
  voice: DEFAULT_ASSISTANT_VOICE,
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

function normalizeSpeechSilenceTimeout(value: unknown): SpeechSilenceTimeout | null {
  return value === 'never' || value === '30s' || value === '3m' ? value : null;
}

function normalizeScreenContextMode(value: unknown): ScreenContextMode | null {
  return value === 'unconfigured' || value === 'manual' || value === 'continuous' ? value : null;
}

function normalizeContinuousScreenQuality(value: unknown): ContinuousScreenQuality | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function normalizeChatTimestampVisibility(value: unknown): ChatTimestampVisibility | null {
  return value === 'hidden' || value === 'visible' ? value : null;
}

export function resolveDesktopVoicePreference(value: unknown): DesktopVoice {
  return resolveAssistantVoicePreference(value);
}

export function resolveActiveScreenContextQuality(
  settings: Pick<DesktopSettings, 'screenContextMode' | 'continuousScreenQuality'>,
): ContinuousScreenQuality {
  if (settings.screenContextMode === 'manual') {
    return 'high';
  }

  return settings.continuousScreenQuality;
}

export function normalizeDesktopSettings(
  settings: Partial<DesktopSettings>,
): DesktopSettings | null {
  const themePreference = normalizeThemePreference(
    settings.themePreference ?? DEFAULT_DESKTOP_SETTINGS.themePreference,
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
  const screenContextMode = normalizeScreenContextMode(
    settings.screenContextMode ?? DEFAULT_DESKTOP_SETTINGS.screenContextMode,
  );
  const continuousScreenQuality = normalizeContinuousScreenQuality(
    settings.continuousScreenQuality ?? DEFAULT_DESKTOP_SETTINGS.continuousScreenQuality,
  );
  const chatTimestampVisibility = normalizeChatTimestampVisibility(
    settings.chatTimestampVisibility ?? DEFAULT_DESKTOP_SETTINGS.chatTimestampVisibility,
  );
  const groundingEnabled = settings.groundingEnabled ?? DEFAULT_DESKTOP_SETTINGS.groundingEnabled;
  const voice = resolveDesktopVoicePreference(settings.voice);
  const systemInstruction = resolveSystemInstructionPreference(settings.systemInstruction);

  if (
    themePreference === null ||
    speechSilenceTimeout === null ||
    !isNonEmptyString(selectedInputDeviceId) ||
    !isNonEmptyString(selectedOutputDeviceId) ||
    typeof voiceEchoCancellationEnabled !== 'boolean' ||
    typeof voiceNoiseSuppressionEnabled !== 'boolean' ||
    typeof voiceAutoGainControlEnabled !== 'boolean' ||
    typeof isPanelPinned !== 'boolean' ||
    screenContextMode === null ||
    continuousScreenQuality === null ||
    chatTimestampVisibility === null ||
    typeof groundingEnabled !== 'boolean'
  ) {
    return null;
  }

  return {
    themePreference,
    speechSilenceTimeout,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled,
    isPanelPinned,
    screenContextMode,
    continuousScreenQuality,
    chatTimestampVisibility,
    groundingEnabled,
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

  if ('screenContextMode' in patch) {
    const screenContextMode = normalizeScreenContextMode(patch.screenContextMode);
    if (screenContextMode === null) {
      return null;
    }
    normalizedPatch.screenContextMode = screenContextMode;
  }

  if ('continuousScreenQuality' in patch) {
    const continuousScreenQuality = normalizeContinuousScreenQuality(
      patch.continuousScreenQuality,
    );
    if (continuousScreenQuality === null) {
      return null;
    }
    normalizedPatch.continuousScreenQuality = continuousScreenQuality;
  }

  if ('chatTimestampVisibility' in patch) {
    const chatTimestampVisibility = normalizeChatTimestampVisibility(patch.chatTimestampVisibility);
    if (chatTimestampVisibility === null) {
      return null;
    }
    normalizedPatch.chatTimestampVisibility = chatTimestampVisibility;
  }

  if ('groundingEnabled' in patch) {
    if (typeof patch.groundingEnabled !== 'boolean') {
      return null;
    }
    normalizedPatch.groundingEnabled = patch.groundingEnabled;
  }

  if ('voice' in patch) {
    if (patch.voice !== undefined && !isAssistantVoice(patch.voice)) {
      return null;
    }
    normalizedPatch.voice = resolveDesktopVoicePreference(patch.voice);
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
