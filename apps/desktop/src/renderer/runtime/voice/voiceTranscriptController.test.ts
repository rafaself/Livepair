import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../../store/sessionStore';
import {
  appendUserTurn,
  createConversationContext,
} from '../conversation/conversationTurnManager';
import { createVoiceTranscriptController } from './voiceTranscriptController';

describe('createVoiceTranscriptController', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('updates user transcript via the compatibility transcript store and the conversation timeline', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().currentVoiceTranscript.user).toEqual({
      text: 'hello',
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'hello',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('updates assistant transcript via the compatibility transcript store and the same conversation turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'hi');
    ctrl.applyTranscriptUpdate('assistant', 'hi there');

    expect(useSessionStore.getState().currentVoiceTranscript.assistant).toEqual({
      text: 'hi there',
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'hi there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('passes transcript finality through to both transcript mirror and conversation turn metadata', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'done', true);

    expect(useSessionStore.getState().currentVoiceTranscript.user).toEqual({
      text: 'done',
      isFinal: true,
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        transcriptFinal: true,
      }),
    ]);
  });

  it('skips transcript writes when text and finality are unchanged', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello');
    const firstTurns = useSessionStore.getState().conversationTurns;

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().conversationTurns).toBe(firstTurns);
    expect(useSessionStore.getState().conversationTurns).toHaveLength(1);
  });

  it('resets only the compatibility transcript and voice-turn references when a new user turn starts after completion', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'first turn', true);
    ctrl.finalizeCurrentVoiceTurns('completed');

    ctrl.applyTranscriptUpdate('user', 'second turn');

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'second turn' },
      assistant: { text: '' },
    });
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'first turn',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'second turn',
        state: 'streaming',
      }),
    ]);
  });

  it('starts a new turn when incoming text extends the previous finalized text', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello there', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'hello there again', true);

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'hello there',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'hello there again',
        state: 'streaming',
      }),
    ]);
  });

  it('reuses the same bubble when an exact duplicate final arrives after completion', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello there', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'hello there', true);

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'hello there',
        state: 'complete',
      }),
    ]);
  });

  it('splits a new turn when incoming text shares a prefix with the finalized turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'hello again');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'hello',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'hello again',
        state: 'streaming',
      }),
    ]);
  });

  it('finalizes an interrupted assistant turn once without duplicating it', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'partial answer');

    ctrl.finalizeCurrentVoiceTurns('interrupted');
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    ]);
  });

  it('emits settled turn ids when voice turns finalize for persistence', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const onConversationTurnSettled = vi.fn();
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx, {
      onConversationTurnSettled,
    });

    ctrl.applyTranscriptUpdate('user', 'Voice question', true);
    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Voice answer', true);
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(onConversationTurnSettled).toHaveBeenCalledWith('user-turn-1');
    expect(onConversationTurnSettled).toHaveBeenCalledWith('assistant-turn-1');
  });

  it('keeps interrupted assistant output labeled as interrupted when a corrective transcript arrives later', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'Partial answer');
    ctrl.finalizeCurrentVoiceTurns('interrupted');

    ctrl.applyTranscriptUpdate('assistant', 'Partial answer corrected');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Partial answer corrected',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
    ]);
  });

  it('splits a new turn when incoming text is a substring of the finalized turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello there', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'hello there',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'hello',
        state: 'streaming',
      }),
    ]);
  });

  it('keeps an interrupted assistant turn on the same bubble when a shorter late update arrives', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'partial answer');
    ctrl.finalizeCurrentVoiceTurns('interrupted');

    ctrl.applyTranscriptUpdate('assistant', 'partial');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
    ]);
  });

  it('starts a fresh streaming user turn after an assistant-only interrupted turn settles', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'partial answer');
    ctrl.finalizeCurrentVoiceTurns('interrupted');

    ctrl.applyTranscriptUpdate('user', 'new question');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'partial answer',
        state: 'complete',
        statusLabel: 'Interrupted',
      }),
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'new question',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'new question' },
      assistant: { text: '' },
    });
  });

  it('starts a fresh streaming user turn after an assistant-only completed turn settles', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'final answer');
    ctrl.finalizeCurrentVoiceTurns('completed');

    ctrl.applyTranscriptUpdate('user', 'follow-up');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'final answer',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'follow-up',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'follow-up' },
      assistant: { text: '' },
    });
  });

  it('routes a mixed-mode typed follow-up reply onto a fresh assistant turn below the typed user turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'spoken request', true);
    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'spoken reply');
    ctrl.finalizeCurrentVoiceTurns('completed');

    appendUserTurn(conversationCtx, 'typed follow-up');
    ctrl.queueMixedModeAssistantReply();
    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'typed reply');
    ctrl.finalizeCurrentVoiceTurns('completed');

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'spoken request',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'spoken reply',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'typed follow-up',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        content: 'typed reply',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('waits for an in-progress assistant turn to settle before opening the mixed-mode follow-up reply slot', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.ensureAssistantTurn();
    ctrl.applyTranscriptUpdate('assistant', 'spoken reply');

    appendUserTurn(conversationCtx, 'typed follow-up');
    ctrl.queueMixedModeAssistantReply();
    ctrl.ensureAssistantTurn();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'spoken reply',
        state: 'streaming',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'typed follow-up',
        state: 'complete',
      }),
    ]);

    ctrl.finalizeCurrentVoiceTurns('interrupted');
    ctrl.ensureAssistantTurn();

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'spoken reply',
        state: 'complete',
        statusLabel: 'Interrupted',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'typed follow-up',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        content: '',
        state: 'streaming',
        statusLabel: 'Responding...',
        source: 'voice',
      }),
    ]);
  });

  it('preserves active voice user turn when consuming queued mixed-mode reply while user is speaking', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    // User starts speaking
    ctrl.applyTranscriptUpdate('user', 'still talking');

    // A typed turn is submitted while the user is still speaking –
    // queueMixedModeAssistantReply calls consumeQueuedMixedModeAssistantReply
    // immediately because there is no streaming assistant turn.
    appendUserTurn(conversationCtx, 'typed input');
    ctrl.queueMixedModeAssistantReply();

    // The in-progress user turn must remain intact so subsequent transcript
    // events continue the same turn instead of creating a new one.
    expect(conversationCtx.currentVoiceUserTurnId).toBe('user-turn-1');

    ctrl.applyTranscriptUpdate('user', 'still talking more');

    expect(useSessionStore.getState().conversationTurns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'user-turn-1',
          content: 'still talking more',
          state: 'streaming',
          source: 'voice',
        }),
      ]),
    );
    // Verify no duplicate / split user turn was created
    const voiceUserTurns = useSessionStore
      .getState()
      .conversationTurns.filter((t) => t.role === 'user' && t.source === 'voice');
    expect(voiceUserTurns).toHaveLength(1);
  });

  it('resetTurnTranscriptState clears transcript state and active voice-turn references', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'new input');
    ctrl.ensureAssistantTurn();

    ctrl.resetTurnTranscriptState();

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: '' },
      assistant: { text: '' },
    });
    expect(conversationCtx.currentVoiceUserTurnId).toBeNull();
    expect(conversationCtx.currentVoiceAssistantTurnId).toBeNull();
  });
});
