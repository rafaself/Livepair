import { describe, expect, it } from 'vitest';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { createControlGatingSnapshot } from '../../../../runtime';

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
        localUserSpeechActive: false,
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
        localUserSpeechActive: false,
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
        localUserSpeechActive: false,
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
        localUserSpeechActive: false,
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
        localUserSpeechActive: false,
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
        localUserSpeechActive: false,
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('Ending Live session');
      expect(action.isLoading).toBe(true);
    });
  });

  describe('speech-activity indicator', () => {
    it('activates the indicator when localUserSpeechActive is true', () => {
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: activeSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
        localUserSpeechActive: true,
      });
      expect(action.kind).toBe('endSpeech');
      // icon contains the indicator span — check the rendered string for the active class
      const iconStr = JSON.stringify(action.icon);
      expect(iconStr).toContain('speech-activity-indicator--active');
    });

    it('does not activate the indicator when localUserSpeechActive is false, even if speechLifecycleStatus is userSpeaking', () => {
      const speakingSnapshot = createControlGatingSnapshot({
        currentMode: 'speech',
        speechLifecycleStatus: 'userSpeaking',
        activeTransport: 'gemini-live',
        voiceSessionStatus: 'ready',
      });
      const action = createAssistantPanelComposerAction({
        controlGatingSnapshot: speakingSnapshot,
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'userSpeaking',
        localUserSpeechActive: false,
      });
      expect(action.kind).toBe('endSpeech');
      const iconStr = JSON.stringify(action.icon);
      expect(iconStr).not.toContain('speech-activity-indicator--active');
    });
  });
});
