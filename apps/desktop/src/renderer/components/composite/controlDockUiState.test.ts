import { describe, expect, it } from 'vitest';
import { createControlDockUiState } from './controlDockUiState';

const baseInput = {
  currentMode: 'speech' as const,
  speechLifecycleStatus: 'listening' as const,
  activeTransport: 'gemini-live' as const,
  voiceSessionStatus: 'active' as const,
  voiceCaptureState: 'inactive' as const,
  screenCaptureState: 'disabled' as const,
  screenContextMode: 'manual' as const,
  isPanelOpen: false,
};

describe('createControlDockUiState – Live session terminology', () => {
  describe('microphoneLabel', () => {
    it('uses Live session language when starting', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'starting',
      });
      expect(state.microphoneLabel).toBe('Live session is starting');
    });

    it('uses Live session language when ending', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'ending',
      });
      expect(state.microphoneLabel).toBe('Live session is ending');
    });

    it('says unavailable outside a Live session when mode is inactive', () => {
      const state = createControlDockUiState({
        ...baseInput,
        currentMode: 'inactive',
        speechLifecycleStatus: 'off',
      });
      expect(state.microphoneLabel).toBe('Microphone unavailable outside a Live session');
    });

    it('says unavailable while Live session starts when mode is active but voice not ready', () => {
      const state = createControlDockUiState({
        ...baseInput,
        voiceSessionStatus: 'connecting',
        voiceCaptureState: 'inactive',
      });
      expect(state.microphoneLabel).toBe('Microphone unavailable while Live session starts');
    });
  });

  describe('screenContextLabel', () => {
    it('uses Live session language when starting', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'starting',
      });
      expect(state.screenContextLabel).toBe('Screen sharing unavailable while Live session starts');
    });

    it('uses Live session language when ending', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'ending',
      });
      expect(state.screenContextLabel).toBe('Screen sharing unavailable while Live session ends');
    });

    it('says unavailable outside a Live session when mode is inactive', () => {
      const state = createControlDockUiState({
        ...baseInput,
        currentMode: 'inactive',
        speechLifecycleStatus: 'off',
      });
      expect(state.screenContextLabel).toBe('Screen sharing unavailable outside a Live session');
    });

    it('says unavailable while Live session starts when voice not ready', () => {
      const state = createControlDockUiState({
        ...baseInput,
        voiceSessionStatus: 'connecting',
        screenCaptureState: 'disabled',
      });
      expect(state.screenContextLabel).toBe('Screen sharing unavailable while Live session starts');
    });
  });

  describe('endSpeechModeLabel', () => {
    it('uses Live session language when starting', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'starting',
      });
      expect(state.endSpeechModeLabel).toBe('Starting Live session');
    });

    it('uses Live session language when ending', () => {
      const state = createControlDockUiState({
        ...baseInput,
        speechLifecycleStatus: 'ending',
      });
      expect(state.endSpeechModeLabel).toBe('Ending Live session');
    });

    it('uses End Live session as default', () => {
      const state = createControlDockUiState(baseInput);
      expect(state.endSpeechModeLabel).toBe('End Live session');
    });
  });
});
