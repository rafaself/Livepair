import type { Rectangle } from 'electron';
import type { CreateEphemeralTokenRequest } from '@livepair/shared-types';
import type { DesktopSettingsPatch } from '../../shared/settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isThemePreference(value: unknown): boolean {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isPreferredMode(value: unknown): boolean {
  return value === 'fast' || value === 'thinking';
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

const DESKTOP_SETTINGS_PATCH_KEYS = [
  'themePreference',
  'backendUrl',
  'preferredMode',
  'selectedInputDeviceId',
  'selectedOutputDeviceId',
  'isPanelPinned',
] as const;

export function toOverlayRectangles(input: unknown): Rectangle[] {
  if (!Array.isArray(input)) {
    throw new Error('overlay:setHitRegions requires an array of rectangles');
  }

  return input.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const { x, y, width, height } = entry as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      throw new Error('overlay:setHitRegions requires an array of rectangles');
    }

    const normalized = {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };

    if (normalized.width <= 0 || normalized.height <= 0) {
      throw new Error('overlay:setHitRegions requires positive width and height');
    }

    return normalized;
  });
}

export function isCreateEphemeralTokenRequest(
  req: unknown,
): req is CreateEphemeralTokenRequest {
  if (typeof req !== 'object' || req === null || Array.isArray(req)) {
    return false;
  }

  if (!('sessionId' in req)) {
    return true;
  }

  const sessionId = (req as { sessionId?: unknown }).sessionId;
  return typeof sessionId === 'string' || typeof sessionId === 'undefined';
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

  if ('selectedInputDeviceId' in value && !isNonEmptyString(value['selectedInputDeviceId'])) {
    return false;
  }

  if (
    'selectedOutputDeviceId' in value &&
    !isNonEmptyString(value['selectedOutputDeviceId'])
  ) {
    return false;
  }

  if ('isPanelPinned' in value && typeof value['isPanelPinned'] !== 'boolean') {
    return false;
  }

  return true;
}
