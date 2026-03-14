// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveScreenFrameDumpRootDir } from './screenFrameDumpPaths';

describe('resolveScreenFrameDumpRootDir', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'livepair-screen-frame-paths-'));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('prefers the desktop project folder when the app path is inside that package', async () => {
    const desktopDir = join(rootDir, 'repo', 'apps', 'desktop');
    const appPath = join(desktopDir, 'out', 'main');
    await mkdir(appPath, { recursive: true });
    await writeFile(
      join(desktopDir, 'package.json'),
      JSON.stringify({ name: '@livepair/desktop' }),
      'utf8',
    );

    expect(
      resolveScreenFrameDumpRootDir({
        appPath,
        tempPath: join(rootDir, 'os-temp'),
      }),
    ).toBe(join(desktopDir, 'frames', 'screen-frame-dumps'));
  });

  it('falls back to the os temp folder when no desktop package root can be resolved', async () => {
    const appPath = join(rootDir, 'dist', 'main');
    await mkdir(appPath, { recursive: true });

    expect(
      resolveScreenFrameDumpRootDir({
        appPath,
        tempPath: join(rootDir, 'os-temp'),
      }),
    ).toBe(join(rootDir, 'os-temp', 'livepair', 'screen-frame-dumps'));
  });

  it('falls back to the os temp folder for app.asar paths', async () => {
    const desktopDir = join(rootDir, 'release', 'app.asar');
    const appPath = join(desktopDir, 'out', 'main');
    await mkdir(appPath, { recursive: true });
    await writeFile(
      join(desktopDir, 'package.json'),
      JSON.stringify({ name: '@livepair/desktop' }),
      'utf8',
    );

    expect(
      resolveScreenFrameDumpRootDir({
        appPath,
        tempPath: join(rootDir, 'os-temp'),
      }),
    ).toBe(join(rootDir, 'os-temp', 'livepair', 'screen-frame-dumps'));
  });
});
