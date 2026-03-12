import { describe, expect, it, vi } from 'vitest';
import type { SessionMode } from '../core/session.types';
import { createGeminiLiveTransportState } from './geminiLiveTransportState';
import type { GeminiLiveSdkServerMessage } from './geminiLiveSdkClient';
import { handleGeminiLiveSdkMessage } from './geminiLiveTransportInbound';
import type { LiveSessionEvent } from './transport.types';

function createHarness(activeMode: SessionMode | null = 'text') {
  const state = createGeminiLiveTransportState();
  state.activeMode = activeMode;

  const events: LiveSessionEvent[] = [];
  const logDiagnostic = vi.fn();
  const resolveSetup = vi.fn();
  const rejectSetup = vi.fn();

  return {
    state,
    events,
    logDiagnostic,
    resolveSetup,
    rejectSetup,
    dispatch(message: GeminiLiveSdkServerMessage) {
      handleGeminiLiveSdkMessage(
        {
          state,
          apiVersion: 'v1alpha',
          model: 'models/gemini-2.0-flash-exp',
          emit: (event) => {
            events.push(event);
          },
          logDiagnostic,
          resolveSetup,
          rejectSetup,
        },
        message,
      );
    },
  };
}

describe('handleGeminiLiveSdkMessage', () => {
  it('resolves setup only after setupComplete and emits connected', () => {
    const harness = createHarness();

    harness.dispatch({ setupComplete: {} });

    expect(harness.state.hasCompletedSetup).toBe(true);
    expect(harness.events).toEqual([
      { type: 'connection-state-changed', state: 'connected' },
    ]);
    expect(harness.resolveSetup).toHaveBeenCalledTimes(1);
    expect(harness.rejectSetup).not.toHaveBeenCalled();
    expect(harness.logDiagnostic).toHaveBeenCalledWith('setup complete', {
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
    });
  });

  it('resets transport state and emits go-away without rejecting after setup completes', () => {
    const harness = createHarness('voice');
    harness.state.hasCompletedSetup = true;
    harness.state.pendingOutputText = 'partial response';
    harness.state.hasOpenAudioStream = true;

    harness.dispatch({
      goAway: {
        reason: 'server draining',
      },
    });

    expect(harness.state.hasCompletedSetup).toBe(false);
    expect(harness.state.hasReceivedGoAway).toBe(true);
    expect(harness.state.pendingOutputText).toBe('');
    expect(harness.state.activeMode).toBe(null);
    expect(harness.state.hasOpenAudioStream).toBe(false);
    expect(harness.events).toEqual([
      { type: 'go-away', detail: 'server draining' },
    ]);
    expect(harness.rejectSetup).not.toHaveBeenCalled();
    expect(harness.logDiagnostic).toHaveBeenCalledWith('go-away received', {
      detail: 'server draining',
    });
  });

  it('normalizes session resumption updates when the handle is missing or the session is not resumable', () => {
    const harness = createHarness();

    harness.dispatch({
      sessionResumptionUpdate: {
        newHandle: '',
        resumable: true,
      },
    });
    harness.dispatch({
      sessionResumptionUpdate: {
        newHandle: 'handles/voice-session-3',
        resumable: false,
      },
    });

    expect(harness.events).toEqual([
      {
        type: 'session-resumption-update',
        handle: null,
        resumable: true,
        detail: undefined,
      },
      {
        type: 'session-resumption-update',
        handle: 'handles/voice-session-3',
        resumable: false,
        detail: 'Gemini Live session is not resumable at this point',
      },
    ]);
  });

  it('accumulates text deltas and emits generation-complete before the completed text message', () => {
    const harness = createHarness();

    harness.dispatch({ text: 'Streaming' });
    harness.dispatch({ text: ' response' });
    harness.dispatch({
      serverContent: {
        generationComplete: true,
        turnComplete: true,
      },
    });

    expect(harness.events).toEqual([
      { type: 'text-delta', text: 'Streaming' },
      { type: 'text-delta', text: ' response' },
      { type: 'generation-complete' },
      { type: 'text-message', text: 'Streaming response' },
      { type: 'turn-complete' },
    ]);
    expect(harness.state.pendingOutputText).toBe('');
  });

  it('clears pending output and short-circuits later handling when Gemini interrupts the turn', () => {
    const harness = createHarness();
    harness.state.pendingOutputText = 'Existing';

    harness.dispatch({
      text: ' delta',
      toolCall: {
        functionCalls: [
          {
            id: 'call-1',
            name: 'get_current_mode',
            args: {},
          },
        ],
      },
      serverContent: {
        interrupted: true,
        inputTranscription: {
          text: 'user transcript',
        },
        outputTranscription: {
          text: 'assistant transcript',
        },
        generationComplete: true,
        turnComplete: true,
      },
    });

    expect(harness.events).toEqual([
      { type: 'text-delta', text: ' delta' },
      { type: 'interrupted' },
    ]);
    expect(harness.state.pendingOutputText).toBe('');
  });

  it('normalizes malformed tool calls into runtime-safe payloads', () => {
    const harness = createHarness('voice');
    const randomUuidSpy = vi
      .spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValue('00000000-0000-4000-8000-000000000000');

    harness.dispatch({
      toolCall: {
        functionCalls: [
          {
            args: ['unexpected', 'shape'] as never,
          },
        ],
      },
    });

    expect(harness.events).toEqual([
      {
        type: 'tool-call',
        calls: [
          {
            id: '00000000-0000-4000-8000-000000000000',
            name: 'unknown_tool',
            arguments: {},
          },
        ],
      },
    ]);

    randomUuidSpy.mockRestore();
  });

  it('ignores assistant audio payloads outside voice mode', () => {
    const harness = createHarness('text');

    harness.dispatch({
      serverContent: {
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AQIDBA==',
              },
            },
          ],
        },
      },
    });

    expect(harness.events).toEqual([]);
  });

  it('emits transcripts and voice audio events while tolerating partial assistant audio parts', () => {
    const harness = createHarness('voice');

    harness.dispatch({
      serverContent: {
        inputTranscription: {
          text: 'First user phrase',
        },
        outputTranscription: {
          text: 'First assistant phrase',
        },
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
              },
            },
            {
              inlineData: {
                data: 'AQIDBA==',
              },
            },
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: 'AQIDBA==',
              },
            },
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AQIDBA==',
              },
            },
          ],
        },
      },
    });

    expect(harness.events).toEqual([
      {
        type: 'input-transcript',
        text: 'First user phrase',
      },
      {
        type: 'output-transcript',
        text: 'First assistant phrase',
      },
      {
        type: 'audio-error',
        detail: 'Unsupported assistant audio format: (missing mime type)',
      },
      {
        type: 'audio-error',
        detail: 'Unsupported assistant audio format: audio/wav',
      },
      {
        type: 'audio-chunk',
        chunk: new Uint8Array([1, 2, 3, 4]),
      },
    ]);
  });

  it('emits only turn-complete when there is no buffered assistant text to flush', () => {
    const harness = createHarness();

    harness.dispatch({
      serverContent: {
        turnComplete: true,
      },
    });

    expect(harness.events).toEqual([
      { type: 'turn-complete' },
    ]);
  });
});
