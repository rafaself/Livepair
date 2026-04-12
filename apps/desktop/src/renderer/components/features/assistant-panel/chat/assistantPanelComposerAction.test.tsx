import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createAssistantPanelComposerAction } from './assistantPanelComposerAction';
import { SpeechActivityIndicator } from '../SpeechActivityIndicator';

describe('createAssistantPanelComposerAction – Live session terminology', () => {
  describe('startSpeech action', () => {
    it('labels Start Live Session for empty conversation', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: true,
        isComposerDisabled: false,
        speechLifecycleStatus: 'off',
        localUserSpeechActive: false,
        sessionActionKind: 'start',
        canEndSpeechMode: false,
      });
      expect(action.kind).toBe('startSpeech');
      expect(action.label).toBe('Start Live Session');
      expect(action.variant).toBe('speechCircle');
    });

    it('renders Resume Session pill for non-empty conversation', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'off',
        localUserSpeechActive: false,
        sessionActionKind: 'start',
        canEndSpeechMode: false,
      });
      expect(action.kind).toBe('startSpeech');
      expect(action.label).toBe('Resume Live Session');
      expect(action.variant).toBe('speechPill');
      const iconStr = JSON.stringify(action.icon);
      expect(iconStr).toContain('Resume Session');
    });
  });

  describe('send action', () => {
    it('labels the send button as a session note action, not generic message', () => {
      const action = createAssistantPanelComposerAction({
        draftText: 'hello',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: true,
      });
      expect(action.kind).toBe('send');
      expect(action.label).toBe('Send note to session');
      expect(action.variant).toBe('default');
    });
  });

  describe('endSpeech action', () => {
    it('labels End Live session in ready state', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: true,
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('End Live session');
      expect(action.variant).toBe('speechPill');
    });

    it('labels Starting Live session during starting transition', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'starting',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: false,
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('Starting Live session');
      expect(action.isLoading).toBe(true);
      expect(action.variant).toBe('speechCircle');
    });

    it('labels Ending Live session during ending transition', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'ending',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: false,
      });
      expect(action.kind).toBe('endSpeech');
      expect(action.label).toBe('Ending Live session');
      expect(action.isLoading).toBe(true);
      expect(action.variant).toBe('speechCircle');
    });
  });

  describe('speech-activity indicator', () => {
    it('activates the indicator when localUserSpeechActive is true', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
        localUserSpeechActive: true,
        sessionActionKind: 'end',
        canEndSpeechMode: true,
      });
      expect(action.kind).toBe('endSpeech');
      expect(isValidElement(action.icon)).toBe(true);
      const children = isValidElement(action.icon) ? action.icon.props.children : [];
      const indicator = Array.isArray(children) ? children[0] : null;

      expect(isValidElement(indicator)).toBe(true);
      expect(indicator?.type).toBe(SpeechActivityIndicator);
      expect(indicator?.props.isActive).toBe(true);
    });

    it('activates the indicator when speechLifecycleStatus is userSpeaking even if localUserSpeechActive is false', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'userSpeaking',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: true,
      });
      expect(action.kind).toBe('endSpeech');
      expect(isValidElement(action.icon)).toBe(true);
      const children = isValidElement(action.icon) ? action.icon.props.children : [];
      const indicator = Array.isArray(children) ? children[0] : null;

      expect(isValidElement(indicator)).toBe(true);
      expect(indicator?.type).toBe(SpeechActivityIndicator);
      expect(indicator?.props.isActive).toBe(true);
    });

    it('does not activate the indicator when both localUserSpeechActive is false and speechLifecycleStatus is listening', () => {
      const action = createAssistantPanelComposerAction({
        draftText: '',
        isConversationEmpty: false,
        isComposerDisabled: false,
        speechLifecycleStatus: 'listening',
        localUserSpeechActive: false,
        sessionActionKind: 'end',
        canEndSpeechMode: true,
      });
      expect(action.kind).toBe('endSpeech');
      expect(isValidElement(action.icon)).toBe(true);
      const children = isValidElement(action.icon) ? action.icon.props.children : [];
      const indicator = Array.isArray(children) ? children[0] : null;

      expect(isValidElement(indicator)).toBe(true);
      expect(indicator?.type).toBe(SpeechActivityIndicator);
      expect(indicator?.props.isActive).toBe(false);
    });
  });
});
