import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { useSessionStore } from '../store/sessionStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import * as voiceToolsModule from './voice/tools/voiceTools';
import {
  createVoiceTransportHarness,
} from './sessionController.testUtils';

describe('createDesktopSessionController – voice tools', () => {
  beforeEach(() => {
    resetDesktopStoresWithDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes local voice tools and responds without breaking the session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-1',
          name: 'get_current_mode',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(voiceTransport.sendToolResponses).toHaveBeenCalledWith([
        {
          id: 'call-1',
          name: 'get_current_mode',
          response: {
            ok: true,
            mode: 'speech',
          },
        },
      ]);
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'ready',
        voiceToolState: {
          status: 'idle',
          toolName: 'get_current_mode',
          callId: 'call-1',
          lastError: null,
        },
      }),
    );
  });

  it('surfaces local tool failures without crashing the voice session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-2',
          name: 'unknown_tool',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(voiceTransport.sendToolResponses).toHaveBeenCalledWith([
        {
          id: 'call-2',
          name: 'unknown_tool',
          response: {
            ok: false,
            error: {
              code: 'tool_not_supported',
              message: 'Tool "unknown_tool" is not supported in voice mode',
            },
          },
        },
      ]);
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'ready',
        voiceToolState: {
          status: 'toolError',
          toolName: 'unknown_tool',
          callId: 'call-2',
          lastError: 'Tool "unknown_tool" is not supported in voice mode',
        },
      }),
    );
  });

  it('cancels in-flight tool calls when the turn is interrupted so stale responses are not sent', async () => {
    const voiceTransport = createVoiceTransportHarness();
    let resolveTool:
      | ((value: { id: string; name: string; response: Record<string, unknown> }) => void)
      | undefined;
    const executeLocalVoiceTool = vi.spyOn(voiceToolsModule, 'executeLocalVoiceTool')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTool = resolve;
          }),
      );
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-3',
          name: 'get_current_mode',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(executeLocalVoiceTool).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().voiceToolState).toEqual(
        expect.objectContaining({
          status: 'toolExecuting',
          toolName: 'get_current_mode',
          callId: 'call-3',
        }),
      );
    });

    voiceTransport.emit({ type: 'interrupted' });
    resolveTool?.({
      id: 'call-3',
      name: 'get_current_mode',
      response: {
        ok: true,
        mode: 'speech',
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(voiceTransport.sendToolResponses).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        voiceSessionStatus: 'recovering',
        voiceToolState: {
          status: 'idle',
          toolName: null,
          callId: null,
          lastError: null,
        },
        lastDebugEvent: expect.objectContaining({
          type: 'voice.tool.cancelled',
          detail: 'voice turn interrupted',
        }),
      }),
    );
  });

  it('keeps tool response send failures non-fatal to the voice session', async () => {
    const voiceTransport = createVoiceTransportHarness();
    voiceTransport.sendToolResponses.mockRejectedValue(new Error('tool response send failed'));
    const controller = createDesktopSessionController({
      logger: {
        onSessionEvent: vi.fn(),
        onTransportEvent: vi.fn(),
      },
      checkBackendHealth: vi.fn(),
      requestSessionToken: vi.fn().mockResolvedValue({
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      }),
      createTransport: vi.fn(() => voiceTransport.transport),
    });

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({
      type: 'tool-call',
      calls: [
        {
          id: 'call-4',
          name: 'get_current_mode',
          arguments: {},
        },
      ],
    });

    await vi.waitFor(() => {
      expect(useSessionStore.getState().voiceToolState).toEqual({
        status: 'toolError',
        toolName: 'get_current_mode',
        callId: 'call-4',
        lastError: 'tool response send failed',
      });
    });

    expect(useSessionStore.getState()).toEqual(
      expect.objectContaining({
        currentMode: 'speech',
        voiceSessionStatus: 'ready',
        activeTransport: 'gemini-live',
        lastRuntimeError: null,
      }),
    );
  });
});
