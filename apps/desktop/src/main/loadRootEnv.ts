import { resolve } from 'node:path';
import { config } from 'dotenv';

export const DESKTOP_ENV_PATH = resolve(__dirname, '../../.env');

export function loadRootEnv(): void {
  config({
    path: process.env['DOTENV_CONFIG_PATH'] ?? DESKTOP_ENV_PATH,
    quiet: true,
  });
}

loadRootEnv();
