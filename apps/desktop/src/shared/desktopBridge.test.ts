import { describe, expect, it } from 'vitest';
import { getOverlayMode, IPC_CHANNELS } from './desktopBridge';

describe('IPC_CHANNELS', () => {
  it('keeps the desktop bridge channel map stable', () => {
    expect(IPC_CHANNELS).toEqual({
      checkHealth: 'health:check',
      requestSessionToken: 'session:requestToken',
      startTextChatStream: 'session:startTextChat',
      cancelTextChatStream: 'session:cancelTextChat',
      textChatEvent: 'session:textChatEvent',
      getSettings: 'settings:get',
      updateSettings: 'settings:update',
      setOverlayHitRegions: 'overlay:setHitRegions',
      setOverlayPointerPassthrough: 'overlay:setPointerPassthrough',
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
