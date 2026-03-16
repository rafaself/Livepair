import type { DesktopSettingsPatch } from '../../../shared/settings';
import { hasOnlyAllowedKeys, isNonEmptyString, isPlainRecord } from './shared';

const DESKTOP_SETTINGS_PATCH_KEYS = [
  'themePreference',
  'preferredMode',
  'speechSilenceTimeout',
  'selectedInputDeviceId',
  'selectedOutputDeviceId',
  'voiceEchoCancellationEnabled',
  'voiceNoiseSuppressionEnabled',
  'voiceAutoGainControlEnabled',
  'isPanelPinned',
  'screenContextMode',
  'continuousScreenQuality',
  'chatTimestampVisibility',
  'groundingEnabled',
  'voice',
  'systemInstruction',
] as const;

function isThemePreference(value: unknown): boolean {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isPreferredMode(value: unknown): boolean {
  return value === 'fast';
}

function isSpeechSilenceTimeout(value: unknown): boolean {
  return value === 'never' || value === '30s' || value === '3m';
}

function isScreenContextMode(value: unknown): boolean {
  return value === 'unconfigured' || value === 'manual' || value === 'continuous';
}

function isContinuousScreenQuality(value: unknown): boolean {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isDesktopVoice(value: unknown): boolean {
  return value === 'Puck' || value === 'Kore' || value === 'Aoede';
}

export function isDesktopSettingsPatch(value: unknown): value is DesktopSettingsPatch {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, DESKTOP_SETTINGS_PATCH_KEYS)) {
    return false;
  }

  if ('themePreference' in value && !isThemePreference(value['themePreference'])) {
    return false;
  }

  if ('preferredMode' in value && !isPreferredMode(value['preferredMode'])) {
    return false;
  }

  if (
    'speechSilenceTimeout' in value
    && !isSpeechSilenceTimeout(value['speechSilenceTimeout'])
  ) {
    return false;
  }

  if ('selectedInputDeviceId' in value && !isNonEmptyString(value['selectedInputDeviceId'])) {
    return false;
  }

  if (
    'selectedOutputDeviceId' in value
    && !isNonEmptyString(value['selectedOutputDeviceId'])
  ) {
    return false;
  }

  if (
    'voiceEchoCancellationEnabled' in value
    && typeof value['voiceEchoCancellationEnabled'] !== 'boolean'
  ) {
    return false;
  }

  if (
    'voiceNoiseSuppressionEnabled' in value
    && typeof value['voiceNoiseSuppressionEnabled'] !== 'boolean'
  ) {
    return false;
  }

  if (
    'voiceAutoGainControlEnabled' in value
    && typeof value['voiceAutoGainControlEnabled'] !== 'boolean'
  ) {
    return false;
  }

  if ('isPanelPinned' in value && typeof value['isPanelPinned'] !== 'boolean') {
    return false;
  }

  if ('screenContextMode' in value && !isScreenContextMode(value['screenContextMode'])) {
    return false;
  }

  if (
    'continuousScreenQuality' in value
    && !isContinuousScreenQuality(value['continuousScreenQuality'])
  ) {
    return false;
  }

  if (
    'chatTimestampVisibility' in value
    && value['chatTimestampVisibility'] !== 'hidden'
    && value['chatTimestampVisibility'] !== 'visible'
  ) {
    return false;
  }

  if ('groundingEnabled' in value && typeof value['groundingEnabled'] !== 'boolean') {
    return false;
  }

  if ('voice' in value && !isDesktopVoice(value['voice'])) {
    return false;
  }

  if ('systemInstruction' in value && typeof value['systemInstruction'] !== 'string') {
    return false;
  }

  return true;
}
