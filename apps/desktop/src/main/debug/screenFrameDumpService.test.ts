// @vitest-environment node
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createScreenFrameDumpService } from './screenFrameDumpService';

function createValidJpegBytes(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

describe('createScreenFrameDumpService', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'livepair-screen-frame-dumps-'));
  });

  it('starts a fresh dump session by clearing the previous dump', async () => {
    const service = createScreenFrameDumpService({ rootDir });
    const jpegBytes = createValidJpegBytes();

    const { directoryPath } = await service.startSession();
    await service.saveFrame({
      sequence: 1,
      mimeType: 'image/jpeg',
      data: jpegBytes,
    });

    await expect(readFile(join(directoryPath, 'frame-000001.jpg'))).resolves.toEqual(
      Buffer.from(jpegBytes),
    );

    await service.startSession();

    await expect(readdir(directoryPath)).resolves.toEqual([]);
  });

  it('keeps saved frames available until the next dump session starts', async () => {
    const service = createScreenFrameDumpService({ rootDir });

    const { directoryPath } = await service.startSession();
    await service.saveFrame({
      sequence: 2,
      mimeType: 'image/jpeg',
      data: new Uint8Array([4, 5, 6]),
    });

    await expect(readdir(directoryPath)).resolves.toEqual(['frame-000002.jpg']);
  });
});
