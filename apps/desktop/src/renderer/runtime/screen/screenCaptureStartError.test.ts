import { describe, expect, it } from 'vitest';
import type { ScreenCaptureAccessStatus } from '../../../shared';
import { mapScreenCaptureStartError } from './screenCaptureStartError';

function makeAccessStatus(
  overrides: Partial<ScreenCaptureAccessStatus>,
): ScreenCaptureAccessStatus {
  return {
    platform: 'linux',
    permissionStatus: null,
    ...overrides,
  };
}

describe('mapScreenCaptureStartError', () => {
  it('maps macOS permission denial to a System Settings action', () => {
    const error = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });

    expect(
      mapScreenCaptureStartError(error, makeAccessStatus({
        platform: 'darwin',
        permissionStatus: 'denied',
      })),
    ).toBe(
      'macOS screen recording permission is denied. Enable Livepair in System Settings > Privacy & Security > Screen Recording, then restart the app.',
    );
  });

  it('maps missing sources to a Linux-friendly source availability message', () => {
    const error = Object.assign(new Error('No sources'), { name: 'NotFoundError' });

    expect(
      mapScreenCaptureStartError(error, makeAccessStatus({ platform: 'linux' })),
    ).toBe(
      'No screen or window sources are available to capture. On Linux, confirm a desktop portal or PipeWire screen-sharing service is running.',
    );
  });

  it('maps OS-level lockouts to a readable diagnostics message', () => {
    const error = Object.assign(new Error('OS lockout'), { name: 'NotReadableError' });

    expect(
      mapScreenCaptureStartError(error, makeAccessStatus({ platform: 'win32' })),
    ).toBe(
      'The selected screen source could not be read because the OS or another application is blocking capture. Close conflicting apps and try again.',
    );
  });

  it('maps invalid invocation timing to a focused user-action message', () => {
    const error = Object.assign(new Error('Invalid state'), { name: 'InvalidStateError' });

    expect(mapScreenCaptureStartError(error, makeAccessStatus({ platform: 'darwin' }))).toBe(
      'Screen capture must be started from an active, focused user action. Reopen the Livepair window and try again.',
    );
  });

  it('maps Electron unsupported-path failures to an actionable handler message', () => {
    expect(
      mapScreenCaptureStartError(new Error('Not supported'), makeAccessStatus({ platform: 'darwin' })),
    ).toBe(
      'Screen capture is unavailable because the Electron display-media handler is not active in this build.',
    );
  });
});
