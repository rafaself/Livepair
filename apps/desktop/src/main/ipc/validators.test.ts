// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Rectangle } from 'electron';
import type { DesktopSettingsPatch } from '../../shared/settings';
import type { CreateEphemeralTokenRequest } from '@livepair/shared-types';
import {
  isCreateEphemeralTokenRequest,
  isDesktopSettingsPatch,
  toOverlayRectangles,
} from './validators';

describe('ipc validators', () => {
  it('normalizes overlay rectangles and rejects invalid shapes', () => {
    const rectangles: Rectangle[] = toOverlayRectangles([
      { x: 1.2, y: 2.6, width: 5.4, height: 7.8 },
    ]);

    expect(rectangles).toEqual([
      { x: 1, y: 3, width: 5, height: 8 },
    ]);

    expect(() => toOverlayRectangles('bad')).toThrow(
      'overlay:setHitRegions requires an array of rectangles',
    );
    expect(() => toOverlayRectangles([{ x: 0, y: 0, width: 0, height: 1 }])).toThrow(
      'overlay:setHitRegions requires positive width and height',
    );
  });

  it('validates token request payloads', () => {
    const valid: CreateEphemeralTokenRequest = { sessionId: 'session-1' };

    expect(isCreateEphemeralTokenRequest(valid)).toBe(true);
    expect(isCreateEphemeralTokenRequest({})).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: undefined })).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: 12 })).toBe(false);
    expect(isCreateEphemeralTokenRequest(undefined)).toBe(false);
  });

  it('validates settings patch payloads', () => {
    const valid: DesktopSettingsPatch = {
      backendUrl: 'http://localhost:3000',
      preferredMode: 'fast',
      isPanelPinned: true,
    };

    expect(isDesktopSettingsPatch(valid)).toBe(true);
    expect(isDesktopSettingsPatch({ bad: true })).toBe(false);
    expect(isDesktopSettingsPatch({ selectedInputDeviceId: '' })).toBe(false);
    expect(isDesktopSettingsPatch({ preferredMode: 'slow' })).toBe(false);
  });
});
