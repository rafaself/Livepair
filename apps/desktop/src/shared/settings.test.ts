import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeDesktopSettings,
  normalizeDesktopSettingsPatch,
} from './settings';

describe('normalizeDesktopSettings', () => {
  it('fills defaults and normalizes backend URLs', () => {
    expect(
      normalizeDesktopSettings({
        backendUrl: ' https://api.livepair.dev/base/ ',
        themePreference: 'dark',
        voiceNoiseSuppressionEnabled: false,
      }),
    ).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://api.livepair.dev/base',
      themePreference: 'dark',
      voiceNoiseSuppressionEnabled: false,
    });
  });

  it('rejects invalid full settings values', () => {
    expect(
      normalizeDesktopSettings({
        preferredMode: 'slow' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        selectedInputDeviceId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        isPanelPinned: 'yes' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        themePreference: 'sepia' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        voiceAutoGainControlEnabled: 'yes' as never,
      }),
    ).toBeNull();
  });
});

describe('normalizeDesktopSettingsPatch', () => {
  it('normalizes valid patch values without injecting defaults', () => {
    expect(
      normalizeDesktopSettingsPatch({
        backendUrl: ' https://api.livepair.dev/base/ ',
        preferredMode: 'fast',
        voiceEchoCancellationEnabled: false,
        isPanelPinned: true,
      }),
    ).toEqual({
      backendUrl: 'https://api.livepair.dev/base',
      preferredMode: 'fast',
      voiceEchoCancellationEnabled: false,
      isPanelPinned: true,
    });
  });

  it('returns null when any patch field is invalid', () => {
    expect(
      normalizeDesktopSettingsPatch({
        themePreference: 'sepia' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        selectedOutputDeviceId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        backendUrl: 'ftp://bad.example.com',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        isPanelPinned: 'yes' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        selectedInputDeviceId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        preferredMode: 'thinking' as never,
      }),
    ).toEqual({ preferredMode: 'fast' });
    expect(
      normalizeDesktopSettingsPatch({
        voiceNoiseSuppressionEnabled: 'no' as never,
      }),
    ).toBeNull();
  });
});
