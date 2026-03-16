import { resolve } from 'path';
import { config } from 'dotenv';

export const API_ENV_PATH = resolve(__dirname, '../../.env');

export function loadRootEnv(): void {
  config({
    path: process.env['DOTENV_CONFIG_PATH'] ?? API_ENV_PATH,
    quiet: true,
  });
}

loadRootEnv();
