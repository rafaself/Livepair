// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Rectangle } from 'electron';
import type { DesktopSettingsPatch } from '../../shared/settings';
import type {
  AppendChatMessageRequest,
  CreateEphemeralTokenRequest,
  TextChatRequest,
} from '@livepair/shared-types';
import {
  isAppendChatMessageRequest,
  isChatId,
  isCreateChatRequest,
  isCreateEphemeralTokenRequest,
  isDesktopSettingsPatch,
  isTextChatCancelRequest,
  isTextChatRequest,
  toOverlayRectangles,
} from './validators';

describe('ipc validators', () => {
  it('normalizes overlay rectangles and rejects invalid shapes', () => {
    const rectangles: Rectangle[] = toOverlayRectangles([
      { x: 1.2, y: 2.6, width: 5.4, height: 7.8 },
    ]);

    expect(rectangles).toEqual([
      { x: 1, y: 3, width: 5, height: 8 },
    ]);

    expect(() => toOverlayRectangles('bad')).toThrow(
      'overlay:setHitRegions requires an array of rectangles',
    );
    expect(() => toOverlayRectangles([{ x: 0, y: 0, width: 0, height: 1 }])).toThrow(
      'overlay:setHitRegions requires positive width and height',
    );
  });

  it('validates token request payloads', () => {
    const valid: CreateEphemeralTokenRequest = { sessionId: 'session-1' };

    expect(isCreateEphemeralTokenRequest(valid)).toBe(true);
    expect(isCreateEphemeralTokenRequest({})).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: undefined })).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: 12 })).toBe(false);
    expect(isCreateEphemeralTokenRequest(undefined)).toBe(false);
    expect(isCreateEphemeralTokenRequest([])).toBe(false);
  });

  it('validates chat memory payloads', () => {
    const appendRequest: AppendChatMessageRequest = {
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored reply',
    };

    expect(isChatId('chat-1')).toBe(true);
    expect(isChatId('')).toBe(false);
    expect(isChatId(12)).toBe(false);

    expect(isCreateChatRequest(undefined)).toBe(true);
    expect(isCreateChatRequest({})).toBe(true);
    expect(isCreateChatRequest({ title: null })).toBe(true);
    expect(isCreateChatRequest({ title: ' New chat ' })).toBe(true);
    expect(isCreateChatRequest({ title: 42 })).toBe(false);
    expect(isCreateChatRequest([])).toBe(false);

    expect(isAppendChatMessageRequest(appendRequest)).toBe(true);
    expect(isAppendChatMessageRequest({ ...appendRequest, role: 'system' })).toBe(false);
    expect(isAppendChatMessageRequest({ ...appendRequest, chatId: '' })).toBe(false);
    expect(isAppendChatMessageRequest({ ...appendRequest, contentText: '' })).toBe(false);
    expect(isAppendChatMessageRequest(undefined)).toBe(false);
  });

  it('validates settings patch payloads', () => {
    const valid: DesktopSettingsPatch = {
      backendUrl: 'http://localhost:3000',
      preferredMode: 'fast',
      speechSilenceTimeout: '30s',
      voiceNoiseSuppressionEnabled: true,
      isPanelPinned: true,
    };

    expect(isDesktopSettingsPatch(valid)).toBe(true);
    expect(
      isDesktopSettingsPatch(
        Object.assign(Object.create(null), {
          themePreference: 'light',
          isPanelPinned: false,
        }),
      ),
    ).toBe(true);
    expect(isDesktopSettingsPatch({ bad: true })).toBe(false);
    expect(isDesktopSettingsPatch({ selectedInputDeviceId: '' })).toBe(false);
    expect(isDesktopSettingsPatch({ preferredMode: 'slow' })).toBe(false);
    expect(isDesktopSettingsPatch({ preferredMode: 'thinking' })).toBe(false);
    expect(isDesktopSettingsPatch({ selectedOutputDeviceId: false })).toBe(false);
    expect(isDesktopSettingsPatch({ voiceEchoCancellationEnabled: 'yes' })).toBe(false);
    expect(isDesktopSettingsPatch({ isPanelPinned: 'yes' })).toBe(false);
    expect(isDesktopSettingsPatch({ speechSilenceTimeout: '5m' })).toBe(false);
  });

  it('validates text chat request payloads', () => {
    const valid: TextChatRequest = {
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    };

    expect(isTextChatRequest(valid)).toBe(true);
    expect(isTextChatRequest({ messages: [] })).toBe(false);
    expect(isTextChatRequest({ messages: [{ role: 'system', content: 'bad' }] })).toBe(
      false,
    );
    expect(isTextChatRequest({ messages: [{ role: 'user', content: '' }] })).toBe(false);
    expect(isTextChatRequest(undefined)).toBe(false);
  });

  it('validates text chat cancel payloads', () => {
    expect(isTextChatCancelRequest({ streamId: 'stream-1' })).toBe(true);
    expect(isTextChatCancelRequest({ streamId: '' })).toBe(false);
    expect(isTextChatCancelRequest({})).toBe(false);
  });
});
