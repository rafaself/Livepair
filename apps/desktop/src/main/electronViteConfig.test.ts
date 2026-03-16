// @vitest-environment node
import { resolve } from 'node:path';
import type { UserConfig } from 'electron-vite';
import { describe, expect, it } from 'vitest';
import config from '../../electron.vite.config';

describe('electron-vite config', () => {
  it('loads renderer env from the repository root', () => {
    expect((config as UserConfig).renderer?.envDir).toBe(resolve(process.cwd(), '../..'));
  });
});
