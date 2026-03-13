import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMessageRecord,
  ChatRecord,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateChatRequest,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  HealthResponse,
  LiveSessionRecord,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import type {
  DesktopSettings,
  DesktopSettingsPatch,
} from './settings';

export type OverlayHitRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayMode = 'linux-shape' | 'forwarded-pointer';

export interface DesktopBridge {
  overlayMode: OverlayMode;
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  createChat: (req?: CreateChatRequest) => Promise<ChatRecord>;
  getChat: (chatId: ChatId) => Promise<ChatRecord | null>;
  getOrCreateCurrentChat: () => Promise<ChatRecord>;
  listChats: () => Promise<ChatRecord[]>;
  listChatMessages: (chatId: ChatId) => Promise<ChatMessageRecord[]>;
  appendChatMessage: (req: AppendChatMessageRequest) => Promise<ChatMessageRecord>;
  createLiveSession: (req: CreateLiveSessionRequest) => Promise<LiveSessionRecord>;
  listLiveSessions: (chatId: ChatId) => Promise<LiveSessionRecord[]>;
  updateLiveSession: (req: UpdateLiveSessionRequest) => Promise<LiveSessionRecord>;
  endLiveSession: (req: EndLiveSessionRequest) => Promise<LiveSessionRecord>;
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
  setOverlayHitRegions: (regions: OverlayHitRegion[]) => Promise<void>;
  setOverlayPointerPassthrough: (enabled: boolean) => Promise<void>;
}

export const IPC_CHANNELS = {
  checkHealth: 'health:check',
  requestSessionToken: 'session:requestToken',
  createChat: 'chatMemory:createChat',
  getChat: 'chatMemory:getChat',
  getOrCreateCurrentChat: 'chatMemory:getOrCreateCurrentChat',
  listChats: 'chatMemory:listChats',
  listChatMessages: 'chatMemory:listMessages',
  appendChatMessage: 'chatMemory:appendMessage',
  createLiveSession: 'liveSession:create',
  listLiveSessions: 'liveSession:listByChat',
  updateLiveSession: 'liveSession:update',
  endLiveSession: 'liveSession:end',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  setOverlayHitRegions: 'overlay:setHitRegions',
  setOverlayPointerPassthrough: 'overlay:setPointerPassthrough',
} as const;

export function getOverlayMode(platform: string): OverlayMode {
  return platform === 'linux' ? 'linux-shape' : 'forwarded-pointer';
}
