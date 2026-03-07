/// <reference types="vite/client" />

import type { DesktopBridge } from '../preload/preload';

declare global {
  interface Window {
    bridge: DesktopBridge;
  }
}
