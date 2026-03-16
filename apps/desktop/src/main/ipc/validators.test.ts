// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Rectangle } from 'electron';
import type { DesktopSettingsPatch } from '../../shared/settings';
import type {
  AppendChatMessageRequest,
  CreateEphemeralTokenRequest,
  ProjectKnowledgeSearchRequest,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import {
  isAppendChatMessageRequest,
  isChatId,
  isCreateChatRequest,
  isCreateEphemeralTokenRequest,
  isProjectKnowledgeSearchRequest,
  isSaveScreenFrameDumpFrameRequest,
  isUpdateLiveSessionRequest,
  isDesktopSettingsPatch,
  toOverlayRectangles,
} from './validators';

describe('ipc validators', () => {
  it('validates sent screen frame dump payloads', () => {
    expect(isSaveScreenFrameDumpFrameRequest({
      sequence: 2,
      mimeType: 'image/jpeg',
      data: new Uint8Array([4, 5, 6]),
      savedAt: '2026-03-15T22:41:03.124Z',
      mode: 'manual',
      quality: 'high',
      reason: 'manual',
    })).toBe(true);

    expect(isSaveScreenFrameDumpFrameRequest({
      sequence: 2,
      mimeType: 'image/jpeg',
      data: new Uint8Array([4, 5, 6]),
      savedAt: '2026-03-15T22:41:09.021Z',
      mode: 'continuous',
      quality: 'medium',
      reason: 'base',
    })).toBe(true);

    expect(isSaveScreenFrameDumpFrameRequest({
      sequence: 0,
      mimeType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
      savedAt: '2026-03-15T22:41:03.124Z',
      mode: 'manual',
      quality: 'high',
      reason: 'manual',
    })).toBe(false);

    expect(isSaveScreenFrameDumpFrameRequest({
      sequence: 1,
      mimeType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
      savedAt: '',
      mode: 'manual',
      quality: 'high',
      reason: 'manual',
    })).toBe(false);

    expect(isSaveScreenFrameDumpFrameRequest({
      sequence: 1,
      mimeType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
      savedAt: '2026-03-15T22:41:03.124Z',
      mode: 'manual',
      quality: 'high',
      reason: 'sent',
    })).toBe(false);
  });

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
    const validProjectKnowledgeRequest: ProjectKnowledgeSearchRequest = {
      query: 'How does desktop verification work?',
    };
    class TokenRequestCandidate {
      sessionId = 'session-1';
    }

    expect(isCreateEphemeralTokenRequest(valid)).toBe(true);
    expect(isCreateEphemeralTokenRequest({})).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: undefined })).toBe(true);
    expect(isCreateEphemeralTokenRequest({ sessionId: 12 })).toBe(false);
    expect(isCreateEphemeralTokenRequest(new Date())).toBe(false);
    expect(isCreateEphemeralTokenRequest(new Map())).toBe(false);
    expect(isCreateEphemeralTokenRequest(new Set())).toBe(false);
    expect(isCreateEphemeralTokenRequest(/session/)).toBe(false);
    expect(isCreateEphemeralTokenRequest(new TokenRequestCandidate())).toBe(false);
    expect(isCreateEphemeralTokenRequest(undefined)).toBe(false);
    expect(isCreateEphemeralTokenRequest([])).toBe(false);
    expect(isProjectKnowledgeSearchRequest(validProjectKnowledgeRequest)).toBe(true);
    expect(isProjectKnowledgeSearchRequest({ query: '  maintainers  ' })).toBe(true);
    expect(isProjectKnowledgeSearchRequest({ query: '' })).toBe(false);
    expect(isProjectKnowledgeSearchRequest({ query: 'repo', extra: true })).toBe(false);
    expect(isProjectKnowledgeSearchRequest(undefined)).toBe(false);
  });

  it('validates chat memory payloads', () => {
    const appendRequest: AppendChatMessageRequest = {
      chatId: 'chat-1',
      role: 'assistant',
      contentText: 'Stored reply',
      answerMetadata: {
        provenance: 'tool_grounded',
        confidence: 'high',
        reason: 'Confirmed by local runtime tool output.',
      },
    };
    const resumptionUpdateRequest: UpdateLiveSessionRequest = {
      kind: 'resumption',
      id: 'live-session-1',
      resumptionHandle: 'handles/live-session-1',
      lastResumptionUpdateAt: '2026-03-12T00:01:00.000Z',
      restorable: true,
    };
    const snapshotUpdateRequest: UpdateLiveSessionRequest = {
      kind: 'snapshot',
      id: 'live-session-1',
      summarySnapshot: 'Persisted summary snapshot',
      contextStateSnapshot: {
        task: {
          entries: [{ key: 'taskStatus', value: 'active' }],
        },
        context: {
          entries: [{ key: 'repo', value: 'Livepair' }],
        },
      },
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
    expect(
      isAppendChatMessageRequest({
        ...appendRequest,
        answerMetadata: {
          provenance: 'unverified',
          citations: [
            {
              label: 'Active file',
            },
          ],
        },
      }),
    ).toBe(true);
    expect(isAppendChatMessageRequest({ ...appendRequest, role: 'system' })).toBe(false);
    expect(isAppendChatMessageRequest({ ...appendRequest, chatId: '' })).toBe(false);
    expect(isAppendChatMessageRequest({ ...appendRequest, contentText: '' })).toBe(false);
    expect(
      isAppendChatMessageRequest({
        ...appendRequest,
        answerMetadata: {
          provenance: 'made_up',
        },
      }),
    ).toBe(false);
    expect(
      isAppendChatMessageRequest({
        ...appendRequest,
        answerMetadata: {
          provenance: 'project_grounded',
          citations: [{ label: '' }],
        },
      }),
    ).toBe(false);
    expect(isAppendChatMessageRequest(undefined)).toBe(false);
    expect(isUpdateLiveSessionRequest(resumptionUpdateRequest)).toBe(true);
    expect(isUpdateLiveSessionRequest(snapshotUpdateRequest)).toBe(true);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'resumption',
        id: 'live-session-1',
        resumptionHandle: null,
      }),
    ).toBe(true);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'resumption',
        id: 'live-session-1',
        restorable: false,
      }),
    ).toBe(true);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'snapshot',
        id: 'live-session-1',
        summarySnapshot: null,
      }),
    ).toBe(true);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'snapshot',
        id: 'live-session-1',
        contextStateSnapshot: {
          task: {
            entries: [{ key: 'taskStatus', value: 'active' }],
          },
          context: {
            entries: [],
          },
        },
      }),
    ).toBe(true);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'resumption',
        id: 'live-session-1',
        invalidatedAt: '2026-03-12T00:02:00.000Z',
        invalidationReason: 'session marked non-restorable',
      }),
    ).toBe(true);
    expect(isUpdateLiveSessionRequest({ id: '' })).toBe(false);
    expect(isUpdateLiveSessionRequest({ id: 'live-session-1' })).toBe(false);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'resumption',
        id: 'live-session-1',
        restorable: 'yes',
      }),
    ).toBe(false);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'snapshot',
        id: 'live-session-1',
        summarySnapshot: 7,
      }),
    ).toBe(false);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'snapshot',
        id: 'live-session-1',
        contextStateSnapshot: {
          task: {
            entries: [{ key: 'taskStatus', value: 7 }],
          },
          context: {
            entries: [],
          },
        },
      }),
    ).toBe(false);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'resumption',
        id: 'live-session-1',
        summarySnapshot: 'Persisted summary snapshot',
      }),
    ).toBe(false);
    expect(
      isUpdateLiveSessionRequest({
        kind: 'snapshot',
        id: 'live-session-1',
        restorable: false,
      }),
    ).toBe(false);
  });

  it('validates settings patch payloads', () => {
    const valid: DesktopSettingsPatch = {
      preferredMode: 'fast',
      speechSilenceTimeout: '30s',
      voiceNoiseSuppressionEnabled: true,
      isPanelPinned: true,
      screenContextMode: 'continuous',
      continuousScreenQuality: 'medium',
      voice: 'Puck',
      systemInstruction: '',
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
    expect(isDesktopSettingsPatch({ backendUrl: 'http://localhost:3000' })).toBe(false);
    expect(isDesktopSettingsPatch({ selectedInputDeviceId: '' })).toBe(false);
    expect(isDesktopSettingsPatch({ preferredMode: 'slow' })).toBe(false);
    expect(isDesktopSettingsPatch({ preferredMode: 'thinking' })).toBe(false);
    expect(isDesktopSettingsPatch({ selectedOutputDeviceId: false })).toBe(false);
    expect(isDesktopSettingsPatch({ voiceEchoCancellationEnabled: 'yes' })).toBe(false);
    expect(isDesktopSettingsPatch({ isPanelPinned: 'yes' })).toBe(false);
    expect(isDesktopSettingsPatch({ speechSilenceTimeout: '5m' })).toBe(false);
    expect(isDesktopSettingsPatch({ screenContextMode: 'burst' })).toBe(false);
    expect(isDesktopSettingsPatch({ continuousScreenQuality: 'ultra' })).toBe(false);
    expect(isDesktopSettingsPatch({ voice: 'InvalidVoice' })).toBe(false);
  });

  it('validates screen frame dump payloads', () => {
    expect(
      isSaveScreenFrameDumpFrameRequest({
        sequence: 1,
        mimeType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
        savedAt: '2026-03-15T22:41:03.124Z',
        mode: 'manual',
        quality: 'high',
        reason: 'manual',
      }),
    ).toBe(true);
    expect(
      isSaveScreenFrameDumpFrameRequest({
        sequence: 0,
        mimeType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
        savedAt: '2026-03-15T22:41:03.124Z',
        mode: 'manual',
        quality: 'high',
        reason: 'manual',
      }),
    ).toBe(false);
    expect(
      isSaveScreenFrameDumpFrameRequest({
        sequence: 1,
        mimeType: 'image/png',
        data: new Uint8Array([1, 2, 3]),
        savedAt: '2026-03-15T22:41:03.124Z',
        mode: 'manual',
        quality: 'high',
        reason: 'manual',
      }),
    ).toBe(false);
    expect(
      isSaveScreenFrameDumpFrameRequest({
        sequence: 1,
        mimeType: 'image/jpeg',
        data: [],
        savedAt: '2026-03-15T22:41:03.124Z',
        mode: 'manual',
        quality: 'high',
        reason: 'manual',
      }),
    ).toBe(false);
  });

});
