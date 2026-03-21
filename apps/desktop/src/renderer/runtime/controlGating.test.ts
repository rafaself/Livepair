import { describe, expect, it } from 'vitest';
import {
  canEndSpeechMode,
  canSubmitComposerText,
  canToggleMicrophone,
  canToggleScreenContext,
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
  shouldShowDockEndControl,
  shouldShowSpeechControls,
} from './controlGating';

describe('controlGating', () => {
  it('keeps composer send gating aligned with speech lifecycle and runtime capability', () => {
    expect(
      canSubmitComposerText(
        createControlGatingSnapshot({
          currentMode: 'inactive',
          speechLifecycleStatus: 'off',
          textSessionStatus: 'disconnected',
          activeTransport: null,
          voiceSessionStatus: 'disconnected',
        }),
      ),
    ).toBe(false);

    expect(
      canSubmitComposerText(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          textSessionStatus: 'disconnected',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'active',
        }),
      ),
    ).toBe(true);

    expect(
      canSubmitComposerText(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'starting',
          textSessionStatus: 'disconnected',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'connecting',
        }),
      ),
    ).toBe(false);

    expect(
      canSubmitComposerText(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'ending',
          textSessionStatus: 'disconnected',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'stopping',
        }),
      ),
    ).toBe(false);

    expect(
      canSubmitComposerText(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          textSessionStatus: 'disconnected',
          activeTransport: null,
          voiceSessionStatus: 'active',
        }),
      ),
    ).toBe(false);
  });

  it('keeps speech-mode action gating aligned to currentMode and speechLifecycle', () => {
    const textModeSnapshot = createControlGatingSnapshot({
      currentMode: 'inactive',
      speechLifecycleStatus: 'off',
    });
    expect(getComposerSpeechActionKind(textModeSnapshot)).toBe('start');

    const activeSpeechSnapshot = createControlGatingSnapshot({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
    });
    expect(getComposerSpeechActionKind(activeSpeechSnapshot)).toBe('end');
    expect(canEndSpeechMode(activeSpeechSnapshot)).toBe(true);

    const teardownSnapshot = createControlGatingSnapshot({
      currentMode: 'inactive',
      speechLifecycleStatus: 'ending',
    });
    expect(getComposerSpeechActionKind(teardownSnapshot)).toBe('end');
    expect(canEndSpeechMode(teardownSnapshot)).toBe(false);
  });

  it('requires an active voice runtime before enabling the microphone control', () => {
    expect(
      canToggleMicrophone(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          voiceSessionStatus: 'active',
          voiceCaptureState: 'muted',
        }),
      ),
    ).toBe(true);

    expect(
      canToggleMicrophone(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'recovering',
          voiceSessionStatus: 'recovering',
          voiceCaptureState: 'muted',
        }),
      ),
    ).toBe(true);

    expect(
      canToggleMicrophone(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          voiceSessionStatus: 'error',
          voiceCaptureState: 'error',
        }),
      ),
    ).toBe(false);

    expect(
      canToggleMicrophone(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'starting',
          voiceSessionStatus: 'connecting',
          voiceCaptureState: 'inactive',
        }),
      ),
    ).toBe(false);
  });

  it('requires an active voice runtime before enabling the screen control', () => {
    expect(
      canToggleScreenContext(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          voiceSessionStatus: 'active',
          activeTransport: 'gemini-live',
          screenCaptureState: 'disabled',
        }),
      ),
    ).toBe(true);

    expect(
      canToggleScreenContext(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'assistantSpeaking',
          voiceSessionStatus: 'active',
          activeTransport: 'gemini-live',
          screenCaptureState: 'capturing',
        }),
      ),
    ).toBe(true);

    expect(
      canToggleScreenContext(
        createControlGatingSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          voiceSessionStatus: 'error',
          screenCaptureState: 'error',
        }),
      ),
    ).toBe(false);
  });

  it('keeps dock speech visibility aligned while speech teardown is still active', () => {
    const activeSpeechSnapshot = createControlGatingSnapshot({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
    });
    expect(shouldShowSpeechControls(activeSpeechSnapshot)).toBe(true);
    expect(shouldShowDockEndControl(activeSpeechSnapshot, false)).toBe(true);

    const teardownSnapshot = createControlGatingSnapshot({
      currentMode: 'inactive',
      speechLifecycleStatus: 'ending',
    });
    expect(shouldShowSpeechControls(teardownSnapshot)).toBe(true);
    expect(shouldShowDockEndControl(teardownSnapshot, false)).toBe(true);
    expect(shouldShowDockEndControl(teardownSnapshot, true)).toBe(false);
  });

  it('hides dock speech controls while the session is still starting', () => {
    const startingSnapshot = createControlGatingSnapshot({
      currentMode: 'speech',
      speechLifecycleStatus: 'starting',
    });
    expect(shouldShowSpeechControls(startingSnapshot)).toBe(false);
    expect(shouldShowDockEndControl(startingSnapshot, false)).toBe(false);
    // Composer must still show the end/loading action so the user sees feedback.
    expect(getComposerSpeechActionKind(startingSnapshot)).toBe('end');
  });
});
