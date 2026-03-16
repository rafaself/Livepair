import type {
  AppendChatMessageRequest,
  ChatId,
  ChatMemoryListOptions,
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  CreateChatRequest,
  CreateLiveSessionRequest,
  EndLiveSessionRequest,
  HealthResponse,
  LiveTelemetryEvent,
  LiveSessionRecord,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
export type { ChatMemoryListOptions } from '@livepair/shared-types';
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

export type ScreenCaptureRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenCaptureSourceKind = 'screen' | 'window';

export type ScreenCaptureOverlayDisplay = {
  displayId: string;
  // Electron screen coordinates in DIP, matching BrowserWindow positioning.
  bounds: ScreenCaptureRect;
  // Electron work-area coordinates in DIP for the display hosting the overlay window.
  workArea: ScreenCaptureRect;
  scaleFactor: number;
};

export type ScreenCaptureSource = {
  id: string;
  name: string;
  kind: ScreenCaptureSourceKind;
  displayId?: string;
};

export type ScreenCaptureSourceSnapshot = {
  sources: ScreenCaptureSource[];
  selectedSourceId: string | null;
  overlayDisplay: ScreenCaptureOverlayDisplay;
};

export type ScreenFrameDumpSessionInfo = {
  directoryPath: string;
};

export type ScreenFrameDumpMode = 'manual' | 'continuous';
export type ScreenFrameDumpQuality = 'low' | 'medium' | 'high';
export type ScreenFrameDumpReason = 'manual' | 'base' | 'burst';

export type SaveScreenFrameDumpFrameRequest = {
  sequence: number;
  mimeType: 'image/jpeg';
  data: Uint8Array;
  savedAt: string;
  mode: ScreenFrameDumpMode;
  quality: ScreenFrameDumpQuality;
  reason: ScreenFrameDumpReason;
};

export type ScreenCapturePermissionStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'unknown'
  | null;

export type ScreenCaptureAccessStatus = {
  platform: string;
  permissionStatus: ScreenCapturePermissionStatus;
};

export type OverlayMode = 'linux-shape' | 'forwarded-pointer';

export interface DesktopBridge {
  overlayMode: OverlayMode;
  quitApp: () => Promise<void>;
  checkHealth: () => Promise<HealthResponse>;
  requestSessionToken: (
    req: CreateEphemeralTokenRequest,
  ) => Promise<CreateEphemeralTokenResponse>;
  searchProjectKnowledge: (
    req: ProjectKnowledgeSearchRequest,
  ) => Promise<ProjectKnowledgeSearchResult>;
  reportLiveTelemetry: (events: LiveTelemetryEvent[]) => Promise<void>;
  createChat: (req?: CreateChatRequest) => Promise<ChatRecord>;
  getChat: (chatId: ChatId) => Promise<ChatRecord | null>;
  getOrCreateCurrentChat: () => Promise<ChatRecord>;
  listChats: () => Promise<ChatRecord[]>;
  listChatMessages: (
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ) => Promise<ChatMessageRecord[]>;
  getChatSummary: (chatId: ChatId) => Promise<DurableChatSummaryRecord | null>;
  appendChatMessage: (req: AppendChatMessageRequest) => Promise<ChatMessageRecord>;
  createLiveSession: (req: CreateLiveSessionRequest) => Promise<LiveSessionRecord>;
  listLiveSessions: (
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ) => Promise<LiveSessionRecord[]>;
  updateLiveSession: (req: UpdateLiveSessionRequest) => Promise<LiveSessionRecord>;
  endLiveSession: (req: EndLiveSessionRequest) => Promise<LiveSessionRecord>;
  getSettings: () => Promise<DesktopSettings>;
  updateSettings: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
  setOverlayHitRegions: (regions: OverlayHitRegion[]) => Promise<void>;
  setOverlayPointerPassthrough: (enabled: boolean) => Promise<void>;
  getScreenCaptureAccessStatus: () => Promise<ScreenCaptureAccessStatus>;
  listScreenCaptureSources: () => Promise<ScreenCaptureSourceSnapshot>;
  selectScreenCaptureSource: (
    sourceId: string | null,
  ) => Promise<ScreenCaptureSourceSnapshot>;
  startScreenFrameDumpSession: () => Promise<ScreenFrameDumpSessionInfo>;
  saveScreenFrameDumpFrame: (
    request: SaveScreenFrameDumpFrameRequest,
  ) => Promise<void>;
}

export const IPC_CHANNELS = {
  quitApp: 'app:quit',
  checkHealth: 'health:check',
  requestSessionToken: 'session:requestToken',
  searchProjectKnowledge: 'projectKnowledge:search',
  reportLiveTelemetry: 'session:reportLiveTelemetry',
  createChat: 'chatMemory:createChat',
  getChat: 'chatMemory:getChat',
  getOrCreateCurrentChat: 'chatMemory:getOrCreateCurrentChat',
  listChats: 'chatMemory:listChats',
  listChatMessages: 'chatMemory:listMessages',
  getChatSummary: 'chatMemory:getSummary',
  appendChatMessage: 'chatMemory:appendMessage',
  createLiveSession: 'liveSession:create',
  listLiveSessions: 'liveSession:listByChat',
  updateLiveSession: 'liveSession:update',
  endLiveSession: 'liveSession:end',
  getSettings: 'settings:get',
  updateSettings: 'settings:update',
  setOverlayHitRegions: 'overlay:setHitRegions',
  setOverlayPointerPassthrough: 'overlay:setPointerPassthrough',
  getScreenCaptureAccessStatus: 'screenCapture:getAccessStatus',
  listScreenCaptureSources: 'screenCapture:listSources',
  selectScreenCaptureSource: 'screenCapture:selectSource',
  startScreenFrameDumpSession: 'screenFrameDump:startSession',
  saveScreenFrameDumpFrame: 'screenFrameDump:saveFrame',
} as const;

export function getOverlayMode(platform: string): OverlayMode {
  return platform === 'linux' ? 'linux-shape' : 'forwarded-pointer';
}
