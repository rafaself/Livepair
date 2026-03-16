/// <reference types="vite/client" />

import type { DesktopBridge } from '../shared';

declare global {
  interface Window {
    bridge: DesktopBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_LIVE_MODEL?: string;
    readonly VITE_LIVE_API_VERSION?: string;
    readonly VITE_LIVE_MEDIA_RESOLUTION?: string;
    readonly VITE_LIVE_CONTEXT_COMPRESSION?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
