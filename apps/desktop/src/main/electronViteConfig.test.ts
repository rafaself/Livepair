// @vitest-environment node
import { resolve } from 'node:path';
import type { UserConfig } from 'electron-vite';
import { describe, expect, it } from 'vitest';
import config from '../../electron.vite.config';

describe('electron-vite config', () => {
  it('loads renderer env from the desktop app root', () => {
    expect((config as UserConfig).renderer?.envDir).toBe(process.cwd());
  });

  it('aliases shared types to source for renderer ESM consumers', () => {
    expect((config as UserConfig).renderer?.resolve?.alias).toMatchObject({
      '@livepair/shared-types': resolve(process.cwd(), '../../packages/shared-types/src/index.ts'),
    });
  });
});
