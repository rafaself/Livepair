import { describe, expect, it } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { visualSessionQualityToMediaResolution } from './visualSessionQuality';

describe('visualSessionQuality', () => {
  it('defaults to Low in DesktopSettings', () => {
    expect(DEFAULT_DESKTOP_SETTINGS.visualSessionQuality).toBe('Low');
  });

  it('maps Low to MEDIA_RESOLUTION_LOW', () => {
    expect(visualSessionQualityToMediaResolution('Low')).toBe('MEDIA_RESOLUTION_LOW');
  });

  it('maps Medium to MEDIA_RESOLUTION_MEDIUM', () => {
    expect(visualSessionQualityToMediaResolution('Medium')).toBe('MEDIA_RESOLUTION_MEDIUM');
  });

  it('maps High to MEDIA_RESOLUTION_HIGH', () => {
    expect(visualSessionQualityToMediaResolution('High')).toBe('MEDIA_RESOLUTION_HIGH');
  });
});
