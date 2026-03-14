import { describe, expect, it } from 'vitest';
import { getOverlayMode, IPC_CHANNELS } from './desktopBridge';

describe('IPC_CHANNELS', () => {
  it('keeps the desktop bridge channel map stable', () => {
    expect(IPC_CHANNELS).toEqual({
      checkHealth: 'health:check',
      requestSessionToken: 'session:requestToken',
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
      listScreenCaptureSources: 'screenCapture:listSources',
      selectScreenCaptureSource: 'screenCapture:selectSource',
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
