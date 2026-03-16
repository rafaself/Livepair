import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { continuousScreenQualityToMediaResolution } from './continuousScreenQuality';

describe('continuousScreenQuality', () => {
  it('defaults to medium in DesktopSettings', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.continuousScreenQuality).toBe('medium');
  });

  it('maps Low to MEDIA_RESOLUTION_LOW', () => {
    expect(continuousScreenQualityToMediaResolution('low')).toBe('MEDIA_RESOLUTION_LOW');
  });

  it('maps Medium to MEDIA_RESOLUTION_MEDIUM', () => {
    expect(continuousScreenQualityToMediaResolution('medium')).toBe('MEDIA_RESOLUTION_MEDIUM');
  });

  it('maps High to MEDIA_RESOLUTION_HIGH', () => {
    expect(continuousScreenQualityToMediaResolution('high')).toBe('MEDIA_RESOLUTION_HIGH');
  });
});
