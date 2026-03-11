import { describe, expect, it, vi } from 'vitest';
import { createVoiceTranscriptController } from './voiceTranscriptController';

function createMockStore() {
  const transcript = {
    user: { text: '' } as { text: string; isFinal?: boolean | undefined },
    assistant: { text: '' } as { text: string; isFinal?: boolean | undefined },
  };
  const setCurrentVoiceTranscriptEntry = vi.fn(
    (role: 'user' | 'assistant', entry: { text: string; isFinal?: boolean | undefined }) => {
      transcript[role] = { ...transcript[role], ...entry };
    },
  );
  const clearCurrentVoiceTranscript = vi.fn(() => {
    transcript.user = { text: '' };
    transcript.assistant = { text: '' };
  });

  return {
    getState: () => ({
      currentVoiceTranscript: transcript,
      setCurrentVoiceTranscriptEntry,
      clearCurrentVoiceTranscript,
    }),
    spies: { setCurrentVoiceTranscriptEntry, clearCurrentVoiceTranscript },
    transcript,
  };
}

describe('createVoiceTranscriptController', () => {
  it('updates user transcript via store', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(store.spies.setCurrentVoiceTranscriptEntry).toHaveBeenCalledWith('user', {
      text: 'hello',
    });
  });

  it('updates assistant transcript via store', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.applyTranscriptUpdate('assistant', 'hi there');

    expect(store.spies.setCurrentVoiceTranscriptEntry).toHaveBeenCalledWith('assistant', {
      text: 'hi there',
    });
  });

  it('passes isFinal when provided', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.applyTranscriptUpdate('user', 'done', true);

    expect(store.spies.setCurrentVoiceTranscriptEntry).toHaveBeenCalledWith('user', {
      text: 'done',
      isFinal: true,
    });
  });

  it('skips update when text and isFinal are unchanged', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.applyTranscriptUpdate('user', 'hello');
    store.spies.setCurrentVoiceTranscriptEntry.mockClear();

    ctrl.applyTranscriptUpdate('user', 'hello');

    expect(store.spies.setCurrentVoiceTranscriptEntry).not.toHaveBeenCalled();
  });

  it('clears transcript on user input after turn completion', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.applyTranscriptUpdate('user', 'first turn');
    ctrl.markTurnCompleted();

    ctrl.applyTranscriptUpdate('user', 'second turn');

    expect(store.spies.clearCurrentVoiceTranscript).toHaveBeenCalled();
  });

  it('does not clear transcript on assistant input after turn completion', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.markTurnCompleted();
    store.spies.clearCurrentVoiceTranscript.mockClear();

    ctrl.applyTranscriptUpdate('assistant', 'response');

    expect(store.spies.clearCurrentVoiceTranscript).not.toHaveBeenCalled();
  });

  it('resets turn completed flag after clearing', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.markTurnCompleted();
    ctrl.applyTranscriptUpdate('user', 'second turn');
    store.spies.clearCurrentVoiceTranscript.mockClear();

    // Third update should NOT clear again
    ctrl.applyTranscriptUpdate('user', 'continued');

    expect(store.spies.clearCurrentVoiceTranscript).not.toHaveBeenCalled();
  });

  it('resetTurnTranscriptState clears transcript and resets flag', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.markTurnCompleted();
    ctrl.resetTurnTranscriptState();

    // Flag was reset, so user input should NOT trigger clear
    store.spies.clearCurrentVoiceTranscript.mockClear();
    ctrl.applyTranscriptUpdate('user', 'new input');

    expect(store.spies.clearCurrentVoiceTranscript).not.toHaveBeenCalled();
  });

  it('clearTranscript delegates to store', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.clearTranscript();

    expect(store.spies.clearCurrentVoiceTranscript).toHaveBeenCalled();
  });

  it('resetTurnCompletedFlag prevents auto-clear on next user input', () => {
    const store = createMockStore();
    const ctrl = createVoiceTranscriptController(store);

    ctrl.markTurnCompleted();
    ctrl.resetTurnCompletedFlag();

    store.spies.clearCurrentVoiceTranscript.mockClear();
    ctrl.applyTranscriptUpdate('user', 'new');

    expect(store.spies.clearCurrentVoiceTranscript).not.toHaveBeenCalled();
  });
});
