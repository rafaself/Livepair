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
      }),
    ).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://api.livepair.dev/base',
      themePreference: 'dark',
    });
  });

  it('defaults both display selections to the primary display sentinel and accepts concrete ids', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.selectedCaptureDisplayId).toBe('primary');
    expect(DEFAULT_DESKTOP_SETTINGS.selectedOverlayDisplayId).toBe('primary');

    expect(
      normalizeDesktopSettings({
        selectedCaptureDisplayId: 'display-2',
        selectedOverlayDisplayId: 'display-3',
      }),
    ).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      selectedCaptureDisplayId: 'display-2',
      selectedOverlayDisplayId: 'display-3',
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
        selectedCaptureDisplayId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        selectedOverlayDisplayId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettings({
        themePreference: 'sepia' as never,
      }),
    ).toBeNull();
  });
});

describe('normalizeDesktopSettingsPatch', () => {
  it('normalizes valid patch values without injecting defaults', () => {
    expect(
      normalizeDesktopSettingsPatch({
        backendUrl: ' https://api.livepair.dev/base/ ',
        preferredMode: 'thinking',
        isPanelPinned: true,
        selectedCaptureDisplayId: 'display-2',
        selectedOverlayDisplayId: 'primary',
      }),
    ).toEqual({
      backendUrl: 'https://api.livepair.dev/base',
      preferredMode: 'thinking',
      isPanelPinned: true,
      selectedCaptureDisplayId: 'display-2',
      selectedOverlayDisplayId: 'primary',
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
        selectedCaptureDisplayId: '',
      }),
    ).toBeNull();
    expect(
      normalizeDesktopSettingsPatch({
        selectedOverlayDisplayId: '',
      }),
    ).toBeNull();
  });
});
