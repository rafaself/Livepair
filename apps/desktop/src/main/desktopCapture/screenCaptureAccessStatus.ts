import { systemPreferences } from 'electron';
import type { ScreenCaptureAccessStatus, ScreenCapturePermissionStatus } from '../../shared';

function normalizePermissionStatus(status: string): ScreenCapturePermissionStatus {
  switch (status) {
    case 'not-determined':
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'unknown':
      return status;
    default:
      return 'unknown';
  }
}

export function getScreenCaptureAccessStatus(
  platform: string = process.platform,
): ScreenCaptureAccessStatus {
  if (platform !== 'darwin') {
    return {
      platform,
      permissionStatus: null,
    };
  }

  try {
    return {
      platform,
      permissionStatus: normalizePermissionStatus(
        systemPreferences.getMediaAccessStatus('screen'),
      ),
    };
  } catch {
    return {
      platform,
      permissionStatus: 'unknown',
    };
  }
}
