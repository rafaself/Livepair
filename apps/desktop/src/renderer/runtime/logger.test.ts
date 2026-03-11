import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeLogger } from './logger';

describe('runtime logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('summarizes binary transport payloads instead of logging every byte', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logger = createRuntimeLogger({ enableConsole: true });

    logger.onTransportEvent({
      type: 'audio-chunk',
      chunk: new Uint8Array([64, 11, 179, 19]),
    });

    expect(infoSpy).toHaveBeenCalledWith(
      '[runtime:transport]',
      'audio-chunk',
      expect.stringContaining('"byteLength": 4'),
    );
    expect(infoSpy).not.toHaveBeenCalledWith(
      '[runtime:transport]',
      'audio-chunk',
      expect.stringContaining('"0": 64'),
    );
  });
});
