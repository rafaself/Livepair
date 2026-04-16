import { describe, expect, it } from 'vitest';
import { getOverlayMode, IPC_CHANNELS } from './desktopBridge';

describe('IPC_CHANNELS', () => {
  it('keeps the desktop bridge channel map stable', () => {
    expect(IPC_CHANNELS).toEqual({
      quitApp: 'app:quit',
      checkHealth: 'health:check',
      requestSessionToken: 'session:requestToken',
      searchProjectKnowledge: 'projectKnowledge:search',
      reportLiveTelemetry: 'session:reportLiveTelemetry',
      createChat: 'chatMemory:createChat',
      getChat: 'chatMemory:getChat',
      getCurrentChat: 'chatMemory:getCurrentChat',
      getOrCreateCurrentChat: 'chatMemory:getOrCreateCurrentChat',
      listChats: 'chatMemory:listChats',
      listChatMessages: 'chatMemory:listMessages',
      getChatSummary: 'chatMemory:getSummary',
      appendChatMessage: 'chatMemory:appendMessage',
      updateChatMessage: 'chatMemory:updateMessage',
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
    });
  });
});

describe('getOverlayMode', () => {
  it('uses shaped overlays on linux only', () => {
    expect(getOverlayMode('linux')).toBe('linux-shape');
    expect(getOverlayMode('darwin')).toBe('forwarded-pointer');
    expect(getOverlayMode('win32')).toBe('forwarded-pointer');
  });
});
