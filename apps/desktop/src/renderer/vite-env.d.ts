/// <reference types="vite/client" />

import type { DesktopBridge } from '../shared/desktopBridge';

declare global {
  interface Window {
    bridge: DesktopBridge;
  }

  interface ImportMetaEnv {
    readonly VITE_LIVE_MODEL?: string;
    readonly VITE_LIVE_API_VERSION?: string;
    readonly VITE_LIVE_VOICE_RESPONSE_MODALITY?: string;
    readonly VITE_LIVE_INPUT_AUDIO_TRANSCRIPTION?: string;
    readonly VITE_LIVE_OUTPUT_AUDIO_TRANSCRIPTION?: string;
    readonly VITE_LIVE_MEDIA_RESOLUTION?: string;
    readonly VITE_LIVE_SESSION_RESUMPTION?: string;
    readonly VITE_LIVE_CONTEXT_COMPRESSION?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
