import { describe, expect, it } from 'vitest';
import {
  createLiveSessionEngine,
  type LiveSessionEngineState,
} from './liveSessionEngine';

function createState(
  overrides: Partial<LiveSessionEngineState> = {},
): LiveSessionEngineState {
  return {
    speechLifecycle: { status: 'off' },
    voiceSessionStatus: 'disconnected',
    ...overrides,
  };
}

describe('createLiveSessionEngine', () => {
  it('applies session start and connection events to the logical session state', () => {
    const engine = createLiveSessionEngine(createState());

    const startTransition = engine.applyEvent({
      type: 'session.start.requested',
      transport: 'gemini-live',
    });

    expect(startTransition.nextState.speechLifecycle.status).toBe('starting');
    expect(startTransition.nextState.voiceSessionStatus).toBe('connecting');
    expect(startTransition.speechLifecycleEvent).toEqual({
      type: 'session.start.requested',
    });

    const readyTransition = engine.applyEvent({ type: 'session.ready' });
    expect(readyTransition.nextState.speechLifecycle.status).toBe('listening');
    expect(readyTransition.nextState.voiceSessionStatus).toBe('connecting');

    const connectedTransition = engine.applyEvent({
      type: 'transport.connected',
      resumed: false,
    });
    expect(connectedTransition.nextState.voiceSessionStatus).toBe('active');
    expect(connectedTransition.nextState.speechLifecycle.status).toBe('listening');
  });

  it('applies interruption and recovery events to the logical session state', () => {
    const engine = createLiveSessionEngine(
      createState({
        speechLifecycle: { status: 'assistantSpeaking' },
        voiceSessionStatus: 'active',
      }),
    );

    const interruptedTransition = engine.applyEvent({ type: 'turn.interrupted' });
    expect(interruptedTransition.nextState.speechLifecycle.status).toBe('interrupted');
    expect(interruptedTransition.nextState.voiceSessionStatus).toBe('interrupted');

    const recoveryStartedTransition = engine.applyEvent({
      type: 'turn.recovery.started',
    });
    expect(recoveryStartedTransition.nextState.speechLifecycle.status).toBe('recovering');
    expect(recoveryStartedTransition.nextState.voiceSessionStatus).toBe('recovering');

    const recoveryCompletedTransition = engine.applyEvent({
      type: 'turn.recovery.completed',
    });
    expect(recoveryCompletedTransition.nextState.speechLifecycle.status).toBe('listening');
    expect(recoveryCompletedTransition.nextState.voiceSessionStatus).toBe('active');
  });

  it('derives assistant output gating from the engine-owned session state', () => {
    const engine = createLiveSessionEngine(
      createState({
        speechLifecycle: { status: 'interrupted' },
        voiceSessionStatus: 'interrupted',
      }),
    );

    expect(
      engine.shouldIgnoreAssistantOutput('turn-complete', {
        hasQueuedMixedModeAssistantReply: false,
        hasStreamingAssistantVoiceTurn: false,
      }),
    ).toEqual({
      ignore: true,
      reason: 'turn-unavailable',
    });

    expect(
      engine.shouldIgnoreAssistantOutput('text-delta', {
        hasQueuedMixedModeAssistantReply: true,
        hasStreamingAssistantVoiceTurn: false,
      }),
    ).toEqual({
      ignore: false,
    });
  });

  it('derives the lifecycle event that a turn-complete should publish', () => {
    const engine = createLiveSessionEngine(
      createState({
        speechLifecycle: { status: 'assistantSpeaking' },
        voiceSessionStatus: 'active',
      }),
    );

    expect(engine.deriveTurnCompleteEvent()).toEqual({
      type: 'turn.assistantCompleted',
    });

    engine.applyEvent({ type: 'turn.assistantCompleted' });
    engine.applyEvent({ type: 'turn.user.speech.detected' });

    expect(engine.deriveTurnCompleteEvent()).toEqual({
      type: 'turn.user.settled',
    });
  });

  it('handles lifecycle-relevant commands using the current engine state', () => {
    const engine = createLiveSessionEngine(createState());

    expect(
      engine.handleCommand({ type: 'session.start', mode: 'speech' }),
    ).toEqual({ accepted: true });

    engine.applyEvent({
      type: 'session.start.requested',
      transport: 'gemini-live',
    });

    expect(
      engine.handleCommand({ type: 'session.start', mode: 'speech' }),
    ).toEqual({
      accepted: false,
      reason: 'session-already-active',
    });

    expect(
      engine.handleCommand({ type: 'textTurn.submit', text: 'hello' }),
    ).toEqual({
      accepted: true,
    });

    const speechActiveEngine = createLiveSessionEngine(
      createState({
        speechLifecycle: { status: 'listening' },
        voiceSessionStatus: 'active',
      }),
    );

    expect(
      speechActiveEngine.handleCommand({ type: 'textTurn.submit', text: 'hello' }),
    ).toEqual({ accepted: true });
  });
});
