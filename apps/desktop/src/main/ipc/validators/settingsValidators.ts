import type { DesktopSettingsPatch } from '../../../shared/settings';
import { hasOnlyAllowedKeys, isNonEmptyString, isPlainRecord } from './shared';

const DESKTOP_SETTINGS_PATCH_KEYS = [
  'themePreference',
  'backendUrl',
  'preferredMode',
  'speechSilenceTimeout',
  'selectedInputDeviceId',
  'selectedOutputDeviceId',
  'voiceEchoCancellationEnabled',
  'voiceNoiseSuppressionEnabled',
  'voiceAutoGainControlEnabled',
  'isPanelPinned',
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

export function isDesktopSettingsPatch(value: unknown): value is DesktopSettingsPatch {
  if (!isPlainRecord(value) || !hasOnlyAllowedKeys(value, DESKTOP_SETTINGS_PATCH_KEYS)) {
    return false;
  }

  if ('themePreference' in value && !isThemePreference(value['themePreference'])) {
    return false;
  }

  if ('backendUrl' in value && typeof value['backendUrl'] !== 'string') {
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

  return true;
}
