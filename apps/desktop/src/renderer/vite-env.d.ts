/// <reference types="vite/client" />

import type { DesktopBridge } from '../shared/desktopBridge';

declare global {
  interface Window {
    bridge: DesktopBridge;
  }
}

export {};
