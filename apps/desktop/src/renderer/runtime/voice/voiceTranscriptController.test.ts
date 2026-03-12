import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../store/sessionStore';
import { createConversationContext } from '../conversation/conversationTurnManager';
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

  it('keeps corrective transcript updates on the same completed user bubble until the next distinct turn', () => {
    const conversationCtx = createConversationContext(useSessionStore);
    const ctrl = createVoiceTranscriptController(useSessionStore, conversationCtx);

    ctrl.applyTranscriptUpdate('user', 'hello there', true);
    ctrl.finalizeCurrentVoiceTurns('completed');
    ctrl.applyTranscriptUpdate('user', 'hello there again', true);

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'hello there again',
        state: 'complete',
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
