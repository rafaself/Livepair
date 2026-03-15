import type { ScreenCaptureAccessStatus, ScreenCapturePermissionStatus } from '../../../shared';

function getMacPermissionDetail(permissionStatus: ScreenCapturePermissionStatus): string | null {
  switch (permissionStatus) {
    case 'denied':
      return 'macOS screen recording permission is denied. Enable Livepair in System Settings > Privacy & Security > Screen Recording, then restart the app.';
    case 'not-determined':
      return 'macOS screen recording permission has not been granted yet. Start screen capture again and approve it, or enable Livepair in System Settings > Privacy & Security > Screen Recording.';
    case 'restricted':
      return 'macOS screen recording is restricted by system policy. Check Screen Recording restrictions in System Settings or device management.';
    default:
      return null;
  }
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export function mapScreenCaptureStartError(
  error: unknown,
  accessStatus: ScreenCaptureAccessStatus | null,
): string {
  const errorName = getErrorName(error);
  const errorMessage = getErrorMessage(error);
  const macPermissionDetail = accessStatus?.platform === 'darwin'
    ? getMacPermissionDetail(accessStatus.permissionStatus)
    : null;

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
    return macPermissionDetail ?? 'Screen capture permission was denied';
  }

  if (errorName === 'NotFoundError') {
    return accessStatus?.platform === 'linux'
      ? 'No screen or window sources are available to capture. On Linux, confirm a desktop portal or PipeWire screen-sharing service is running.'
      : 'No screen or window sources are available to capture.';
  }

  if (errorName === 'NotReadableError') {
    return macPermissionDetail
      ?? 'The selected screen source could not be read because the OS or another application is blocking capture. Close conflicting apps and try again.';
  }

  if (errorName === 'InvalidStateError') {
    return 'Screen capture must be started from an active, focused user action. Reopen the Livepair window and try again.';
  }

  if (errorMessage.includes('Not supported')) {
    return 'Screen capture is unavailable because the Electron display-media handler is not active in this build.';
  }

  // Electron emits this message when the display-media handler responds with
  // no video source (empty callback). This happens when no screen source is
  // available or selected — surface a clear, actionable message instead of
  // the raw internal string.
  if (errorMessage === 'Error starting capture') {
    return accessStatus?.platform === 'linux'
      ? 'No screen source could be selected. Select a source in the screen share settings, or confirm a desktop portal or PipeWire screen-sharing service is running on Linux.'
      : 'No screen source could be selected. Open screen share settings and choose a source before starting capture.';
  }

  if (errorMessage.length > 0) {
    return errorMessage;
  }

  return 'Screen capture failed';
}
