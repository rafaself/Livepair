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
        speechSilenceTimeout: '30s',
        voiceNoiseSuppressionEnabled: false,
      }),
    ).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://api.livepair.dev/base',
      themePreference: 'dark',
      speechSilenceTimeout: '30s',
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
    expect(
      normalizeDesktopSettings({
        speechSilenceTimeout: '5m' as never,
      }),
    ).toBeNull();
  });
});

describe('voice and system instruction settings', () => {
  it('defaults to the documented voice and product instruction', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.voice).toBe('Puck');
    expect(DEFAULT_DESKTOP_SETTINGS.systemInstruction).toBe(
      'You are Livepair, a realtime multimodal desktop assistant.',
    );
  });

  it('falls back to Puck when persisted voice is invalid', () => {
    expect(
      normalizeDesktopSettings({
        voice: 'InvalidVoice' as never,
      }),
    ).toMatchObject({
      voice: 'Puck',
    });
  });

  it('accepts an empty persisted system instruction', () => {
    expect(
      normalizeDesktopSettings({
        systemInstruction: '',
      }),
    ).toMatchObject({
      systemInstruction: '',
    });
  });
});

describe('visualSessionQuality setting', () => {
  it('defaults to Low', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.visualSessionQuality).toBe('Low');
  });

  it('accepts Low, Medium, and High in normalizeDesktopSettings', () => {
    for (const quality of ['Low', 'Medium', 'High'] as const) {
      expect(
        normalizeDesktopSettings({ visualSessionQuality: quality }),
      ).toMatchObject({ visualSessionQuality: quality });
    }
  });

  it('rejects invalid visualSessionQuality in normalizeDesktopSettings', () => {
    expect(
      normalizeDesktopSettings({ visualSessionQuality: 'Ultra' as never }),
    ).toBeNull();
  });

  it('accepts Low, Medium, and High in normalizeDesktopSettingsPatch', () => {
    for (const quality of ['Low', 'Medium', 'High'] as const) {
      expect(
        normalizeDesktopSettingsPatch({ visualSessionQuality: quality }),
      ).toEqual({ visualSessionQuality: quality });
    }
  });

  it('rejects invalid visualSessionQuality in normalizeDesktopSettingsPatch', () => {
    expect(
      normalizeDesktopSettingsPatch({ visualSessionQuality: 'Ultra' as never }),
    ).toBeNull();
  });
});

describe('normalizeDesktopSettingsPatch', () => {
  it('normalizes valid patch values without injecting defaults', () => {
    expect(
      normalizeDesktopSettingsPatch({
        backendUrl: ' https://api.livepair.dev/base/ ',
        preferredMode: 'fast',
        speechSilenceTimeout: '3m',
        voiceEchoCancellationEnabled: false,
        isPanelPinned: true,
        voice: 'Aoede',
        systemInstruction: '',
      }),
    ).toEqual({
      backendUrl: 'https://api.livepair.dev/base',
      preferredMode: 'fast',
      speechSilenceTimeout: '3m',
      voiceEchoCancellationEnabled: false,
      isPanelPinned: true,
      voice: 'Aoede',
      systemInstruction: '',
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
    expect(
      normalizeDesktopSettingsPatch({
        speechSilenceTimeout: '5m' as never,
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        voice: 'InvalidVoice' as never,
      }),
    ).toBeNull();
  });
});
