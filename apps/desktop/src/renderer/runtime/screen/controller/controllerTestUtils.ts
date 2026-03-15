import { vi } from 'vitest';
import type { DesktopSession } from '../../transport/transport.types';
import type { LocalScreenCapture } from '../localScreenCapture';
import type { LocalScreenFrame } from '../screen.types';

export function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

export function createMockScreenCapture() {
  return {
    start: vi.fn(
      async (_options: Parameters<LocalScreenCapture['start']>[0]): Promise<void> => undefined,
    ),
    stop: vi.fn(async (): Promise<void> => undefined),
    updateQuality: vi.fn(
      (_params: Parameters<LocalScreenCapture['updateQuality']>[0]): void => undefined,
    ),
  } satisfies LocalScreenCapture;
}

export function createScreenFrame(
  sequence: number,
  fill = sequence,
): LocalScreenFrame {
  return {
    data: new Uint8Array(128).fill(fill),
    mimeType: 'image/jpeg',
    sequence,
    widthPx: 640,
    heightPx: 360,
  };
}

export function createTransportMock() {
  const sendVideoFrame = vi.fn(
    async (_data: Uint8Array, _mimeType: 'image/jpeg'): Promise<void> => undefined,
  );
  const transport = { sendVideoFrame } as unknown as DesktopSession;

  return {
    transport,
    sendVideoFrame,
  };
}
