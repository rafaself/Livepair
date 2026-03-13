import { describe, expect, it } from 'vitest';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { createControlGatingSnapshot } from '../../runtime/controlGating';

const inactiveSnapshot = createControlGatingSnapshot({
  currentMode: 'inactive',
  speechLifecycleStatus: 'off',
});

const activeSnapshot = createControlGatingSnapshot({
  currentMode: 'speech',
  speechLifecycleStatus: 'listening',
  activeTransport: 'gemini-live',
  voiceSessionStatus: 'ready',
});

const startingSnapshot = createControlGatingSnapshot({
  currentMode: 'speech',
  speechLifecycleStatus: 'starting',
});

const endingSnapshot = createControlGatingSnapshot({
  currentMode: 'speech',
  speechLifecycleStatus: 'ending',
});

describe('createAssistantPanelComposerAction – Live session terminology', () => {
  describe('startSpeech action', () => {
    it('labels Start Live Session for empty conversation', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: inactiveSnapshot,
        draftText: '',
        isConversationEmpty: true,
        isComposerDisabled: false,
        speechLifecycleStatus: 'off',
      });
      expect(action.kind).toBe('startSpeech');
      expect(action.label).toBe('Start Live Session');
    });

    it('labels Resume Live Session for non-empty conversation', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: inactiveSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'off',
      });
      expect(action.kind).toBe('startSpeech');
      expect(action.label).toBe('Resume Live Session');
    });
  });

  describe('send action', () => {
    it('labels the send button as a session note action, not generic message', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: activeSnapshot,
        draftText: 'hello',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
      });
      expect(action.kind).toBe('send');
      expect(action.label).toBe('Send note to session');
    });
  });

  describe('endSpeech action', () => {
    it('labels End Live session in ready state', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: activeSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('End Live session');
    });

    it('labels Starting Live session during starting transition', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: startingSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'starting',
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('Starting Live session');
      expect(action.isLoading).toBe(true);
    });

    it('labels Ending Live session during ending transition', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: endingSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'ending',
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('Ending Live session');
      expect(action.isLoading).toBe(true);
    });
  });
});
