import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
  normalizeDesktopSettings,
  normalizeDesktopSettingsPatch,
  resolveActiveScreenContextQuality,
} from './settings';

describe('normalizeDesktopSettings', () => {
  it('fills defaults for supported settings', () => {
    expect(
      normalizeDesktopSettings({
        themePreference: 'dark',
        speechSilenceTimeout: '30s',
        voiceNoiseSuppressionEnabled: false,
      }),
    ).toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
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
    expect(DEFAULT_DESKTOP_SETTINGS.groundingEnabled).toBe(true);
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

  it('falls back to the default instruction when the persisted instruction is empty', () => {
    expect(
      normalizeDesktopSettings({
        systemInstruction: '',
      }),
    ).toMatchObject({
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
  });

  it('falls back to the default instruction when the persisted instruction is whitespace-only', () => {
    expect(
      normalizeDesktopSettings({
        systemInstruction: '   \n\t  ',
      }),
    ).toMatchObject({
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
  });

  it('trims and caps persisted instructions to the product max length', () => {
    const overlongInstruction = `  ${'a'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 25)}  `;

    expect(
      normalizeDesktopSettings({
        systemInstruction: overlongInstruction,
      }),
    ).toMatchObject({
      systemInstruction: 'a'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH),
    });
  });

  it('accepts groundingEnabled and rejects invalid grounding values', () => {
    expect(
      normalizeDesktopSettings({
        groundingEnabled: false,
      }),
    ).toMatchObject({
      groundingEnabled: false,
    });
    expect(
      normalizeDesktopSettings({
        groundingEnabled: 'sometimes' as never,
      }),
    ).toBeNull();
  });
});

describe('screen context settings', () => {
  it('defaults to the first-use contract', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.screenContextMode).toBe('unconfigured');
    expect(DEFAULT_DESKTOP_SETTINGS.continuousScreenQuality).toBe('medium');
  });

  it('accepts all supported screen context modes in normalizeDesktopSettings', () => {
    for (const mode of ['unconfigured', 'manual', 'continuous'] as const) {
      expect(
        normalizeDesktopSettings({ screenContextMode: mode }),
      ).toMatchObject({ screenContextMode: mode });
    }
  });

  it('rejects invalid screenContextMode in normalizeDesktopSettings', () => {
    expect(
      normalizeDesktopSettings({ screenContextMode: 'burst' as never }),
    ).toBeNull();
  });

  it('accepts low, medium, and high in normalizeDesktopSettings', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      expect(
        normalizeDesktopSettings({ continuousScreenQuality: quality }),
      ).toMatchObject({ continuousScreenQuality: quality });
    }
  });

  it('rejects invalid continuousScreenQuality in normalizeDesktopSettings', () => {
    expect(
      normalizeDesktopSettings({ continuousScreenQuality: 'Ultra' as never }),
    ).toBeNull();
  });

  it('accepts all supported screen context modes in normalizeDesktopSettingsPatch', () => {
    for (const mode of ['unconfigured', 'manual', 'continuous'] as const) {
      expect(
        normalizeDesktopSettingsPatch({ screenContextMode: mode }),
      ).toEqual({ screenContextMode: mode });
    }
  });

  it('accepts low, medium, and high in normalizeDesktopSettingsPatch', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      expect(
        normalizeDesktopSettingsPatch({ continuousScreenQuality: quality }),
      ).toEqual({ continuousScreenQuality: quality });
    }
  });

  it('rejects invalid screenContextMode in normalizeDesktopSettingsPatch', () => {
    expect(
      normalizeDesktopSettingsPatch({ screenContextMode: 'burst' as never }),
    ).toBeNull();
  });

  it('rejects invalid continuousScreenQuality in normalizeDesktopSettingsPatch', () => {
    expect(
      normalizeDesktopSettingsPatch({ continuousScreenQuality: 'Ultra' as never }),
    ).toBeNull();
  });

  it('uses High quality for manual mode and the configured quality otherwise', () => {
    expect(
      resolveActiveScreenContextQuality({
        screenContextMode: 'manual',
        continuousScreenQuality: 'low',
      }),
    ).toBe('high');
    expect(
      resolveActiveScreenContextQuality({
        screenContextMode: 'continuous',
        continuousScreenQuality: 'medium',
      }),
    ).toBe('medium');
    expect(
      resolveActiveScreenContextQuality({
        screenContextMode: 'unconfigured',
        continuousScreenQuality: 'medium',
      }),
    ).toBe('medium');
  });
});

describe('normalizeDesktopSettingsPatch', () => {
  it('normalizes valid patch values without injecting defaults', () => {
    expect(
      normalizeDesktopSettingsPatch({
        preferredMode: 'fast',
        speechSilenceTimeout: '3m',
        voiceEchoCancellationEnabled: false,
        isPanelPinned: true,
        groundingEnabled: false,
        voice: 'Aoede',
        systemInstruction: '  Stay concise.  ',
      }),
    ).toEqual({
      preferredMode: 'fast',
      speechSilenceTimeout: '3m',
      voiceEchoCancellationEnabled: false,
      isPanelPinned: true,
      groundingEnabled: false,
      voice: 'Aoede',
      systemInstruction: 'Stay concise.',
    });
  });

  it('normalizes empty or overlong instruction patches before persistence', () => {
    expect(
      normalizeDesktopSettingsPatch({
        systemInstruction: '  \n ',
      }),
    ).toEqual({
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });

    expect(
      normalizeDesktopSettingsPatch({
        systemInstruction: `  ${'b'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 10)}  `,
      }),
    ).toEqual({
      systemInstruction: 'b'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH),
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
    expect(
      normalizeDesktopSettingsPatch({
        groundingEnabled: 'sometimes' as never,
      }),
    ).toBeNull();
  });
});
