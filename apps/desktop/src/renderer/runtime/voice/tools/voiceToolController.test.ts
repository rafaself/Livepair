import type { AnswerMetadata } from '@livepair/shared-types';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createVoiceToolController } from './voiceToolController';
import type { DesktopSession } from '../../transport/transport.types';
import type { VoiceToolCall } from '../voice.types';
import type { ProductMode } from '../../core/session.types';
import type { VoiceToolExecutionSnapshot } from './voiceTools';
import * as voiceToolsModule from './voiceTools';

function createHarness(options: { onAnswerMetadata?: (answerMetadata: AnswerMetadata) => void } = {}) {
  const setVoiceToolState = vi.fn();
  const setLastDebugEvent = vi.fn();
  const store = { getState: () => ({ setVoiceToolState, setLastDebugEvent }) };

  const sendToolResponses = vi.fn(() => Promise.resolve());
  const transport = { sendToolResponses } as unknown as DesktopSession;
  let currentTransport: DesktopSession | null = transport;

  const snapshot: VoiceToolExecutionSnapshot = {
    currentMode: 'speech' as ProductMode,
    textSessionStatus: 'idle',
    speechLifecycleStatus: 'listening',
    voiceSessionStatus: 'active',
    voiceCaptureState: 'capturing',
    voicePlaybackState: 'idle',
  };
  const getSnapshot = vi.fn(() => snapshot);

  const ctrl = createVoiceToolController(
    store,
    () => currentTransport,
    getSnapshot,
    options.onAnswerMetadata,
  );

  return {
    ctrl,
    setVoiceToolState,
    setLastDebugEvent,
    sendToolResponses,
    getSnapshot,
    setTransport: (t: DesktopSession | null) => { currentTransport = t; },
    transport,
  };
}

function makeCall(id = 'call-1', name = 'get_current_mode'): VoiceToolCall {
  return { id, name, arguments: {} };
}

function defaultMockExecute(call: VoiceToolCall) {
  return Promise.resolve({ id: call.id, name: call.name, response: { ok: true } });
}

describe('createVoiceToolController', () => {
  let mockedExecute: MockInstance;

  beforeEach(() => {
    mockedExecute = vi.spyOn(voiceToolsModule, 'executeLocalVoiceTool')
      .mockImplementation(defaultMockExecute as typeof voiceToolsModule.executeLocalVoiceTool);
  });

  it('setState delegates to store', () => {
    const { ctrl, setVoiceToolState } = createHarness();

    ctrl.setState({ status: 'idle' });

    expect(setVoiceToolState).toHaveBeenCalledWith({ status: 'idle' });
  });

  it('reset sets default tool state', () => {
    const { ctrl, setVoiceToolState } = createHarness();

    ctrl.reset();

    expect(setVoiceToolState).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'idle', toolName: null, callId: null }),
    );
  });

  it('enqueue executes tool calls and sends responses', async () => {
    const { ctrl, sendToolResponses } = createHarness();

    ctrl.enqueue([makeCall()]);

    await vi.waitFor(() => {
      expect(sendToolResponses).toHaveBeenCalledTimes(1);
    });
  });

  it('enqueue transitions through tool state lifecycle', async () => {
    const { ctrl, setVoiceToolState } = createHarness();
    const call = makeCall();

    ctrl.enqueue([call]);

    await vi.waitFor(() => {
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'toolCallPending', callId: call.id }),
      );
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'toolExecuting', callId: call.id }),
      );
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'toolResponding' }),
      );
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' }),
      );
    });
  });

  it('enqueue passes snapshot to executeLocalVoiceTool', async () => {
    const { ctrl, getSnapshot } = createHarness();

    ctrl.enqueue([makeCall()]);

    await vi.waitFor(() => {
      expect(mockedExecute).toHaveBeenCalledWith(
        expect.any(Object),
        getSnapshot(),
        undefined,
        undefined,
      );
    });
  });

  it('enqueue skips when transport is null', async () => {
    const { ctrl, setTransport, sendToolResponses, setVoiceToolState } = createHarness();
    setTransport(null);

    ctrl.enqueue([makeCall()]);

    // Give time for any async work
    await new Promise((r) => setTimeout(r, 10));

    expect(sendToolResponses).not.toHaveBeenCalled();
    // Only the chain catch setup runs, no tool state transitions
    expect(setVoiceToolState).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'toolExecuting' }),
    );
  });

  it('enqueue skips empty calls array', async () => {
    const { ctrl, sendToolResponses } = createHarness();

    ctrl.enqueue([]);

    await new Promise((r) => setTimeout(r, 10));
    expect(sendToolResponses).not.toHaveBeenCalled();
  });

  it('enqueue aborts when transport changes mid-execution', async () => {
    const { ctrl, setTransport, sendToolResponses } = createHarness();

    mockedExecute.mockImplementation(async (call) => {
      setTransport({ sendToolResponses: vi.fn() } as unknown as DesktopSession);
      return { id: call.id, name: call.name, response: { ok: true } };
    });

    ctrl.enqueue([makeCall('c1'), makeCall('c2')]);

    await vi.waitFor(() => {
      expect(mockedExecute).toHaveBeenCalledTimes(1);
    });
    expect(sendToolResponses).not.toHaveBeenCalled();
  });

  it('enqueue reports error when sendToolResponses fails', async () => {
    const { ctrl, sendToolResponses, setVoiceToolState } = createHarness();
    sendToolResponses.mockRejectedValue(new Error('send failed'));

    ctrl.enqueue([makeCall()]);

    await vi.waitFor(() => {
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'toolError',
          lastError: 'send failed',
        }),
      );
    });
  });

  it('enqueue extracts error from tool response', async () => {
    const { ctrl, setVoiceToolState } = createHarness();

    mockedExecute.mockResolvedValue({
      id: 'c1',
      name: 'test',
      response: { error: { message: 'tool failed' } },
    });

    ctrl.enqueue([makeCall()]);

    await vi.waitFor(() => {
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'toolError', lastError: 'tool failed' }),
      );
    });
  });

  it('forwards derived answer metadata from successful tool responses', async () => {
    const onAnswerMetadata = vi.fn();
    const { ctrl } = createHarness({ onAnswerMetadata });

    mockedExecute.mockResolvedValue({
      id: 'c-project',
      name: 'search_project_knowledge',
      response: {
        ok: true,
        answerMetadata: {
          provenance: 'project_grounded',
          confidence: 'high',
          citations: [{ label: 'README.md' }],
        },
      },
    });

    ctrl.enqueue([makeCall('c-project', 'search_project_knowledge')]);

    await vi.waitFor(() => {
      expect(onAnswerMetadata).toHaveBeenCalledWith({
        provenance: 'project_grounded',
        confidence: 'high',
        citations: [{ label: 'README.md' }],
      });
    });
  });

  it('cancel clears pending tool state and suppresses stale results', async () => {
    const { ctrl, sendToolResponses, setVoiceToolState, setLastDebugEvent } = createHarness();
    let resolveTool:
      | ((value: { id: string; name: string; response: Record<string, unknown> }) => void)
      | undefined;

    mockedExecute.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTool = resolve;
        }),
    );

    ctrl.enqueue([makeCall()]);

    await vi.waitFor(() => {
      expect(setVoiceToolState).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'toolExecuting' }),
      );
    });

    ctrl.cancel('voice turn interrupted');
    resolveTool?.({
      id: 'call-1',
      name: 'get_current_mode',
      response: { ok: true, mode: 'speech' },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendToolResponses).not.toHaveBeenCalled();
    expect(setVoiceToolState).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'idle',
        toolName: null,
        callId: null,
        lastError: null,
      }),
    );
    expect(setLastDebugEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'voice.tool.cancelled',
        detail: 'voice turn interrupted',
      }),
    );
  });

  it('resetChain resets the promise chain', () => {
    const { ctrl } = createHarness();
    // Should not throw
    ctrl.resetChain();
  });
});
