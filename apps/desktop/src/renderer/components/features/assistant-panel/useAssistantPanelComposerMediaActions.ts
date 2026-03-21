import { useCallback } from 'react';
import {
  canEndSpeechMode,
  canToggleScreenContext,
  type ControlGatingSnapshot,
  type ScreenCaptureState,
  type VoiceCaptureState,
} from '../../../runtime';

type UseAssistantPanelComposerMediaActionsOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  composerSpeechActionKind: 'start' | 'end';
  getIsComposerMicrophoneEnabled: () => boolean;
  setComposerMicrophoneEnabled: (enabled: boolean) => void;
  screenShareModeGate?: (action: () => Promise<void>) => Promise<boolean | void>;
  isVoiceSessionActive: boolean;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  onStartVoiceSession: () => Promise<void>;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onEndSpeechMode: () => Promise<void>;
};

export type AssistantPanelComposerMediaActions = {
  handleStartSpeechMode: () => Promise<void>;
  handleStartSpeechModeWithScreen: () => Promise<boolean>;
  handleToggleComposerMicrophone: () => Promise<void>;
  handleToggleComposerScreenShare: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

function isScreenCaptureActive(screenCaptureState: ScreenCaptureState): boolean {
  return (
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing'
  );
}

export function useAssistantPanelComposerMediaActions({
  controlGatingSnapshot,
  composerSpeechActionKind,
  getIsComposerMicrophoneEnabled,
  setComposerMicrophoneEnabled,
  screenShareModeGate,
  isVoiceSessionActive,
  voiceCaptureState,
  screenCaptureState,
  onStartVoiceSession,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onStartScreenCapture,
  onStopScreenCapture,
  onEndSpeechMode,
}: UseAssistantPanelComposerMediaActionsOptions): AssistantPanelComposerMediaActions {
  const runScreenShareAction = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (screenShareModeGate) {
      return (await screenShareModeGate(action)) !== false;
    }

    await action();
    return true;
  }, [screenShareModeGate]);

  const handleStartSpeechMode = useCallback(async (): Promise<void> => {
    if (composerSpeechActionKind !== 'start') {
      return;
    }

    setComposerMicrophoneEnabled(true);
    await onStartVoiceSession();
  }, [composerSpeechActionKind, onStartVoiceSession, setComposerMicrophoneEnabled]);

  const handleStartSpeechModeWithScreen = useCallback(async (): Promise<boolean> => {
    if (composerSpeechActionKind !== 'start') {
      return false;
    }

    return runScreenShareAction(async () => {
      setComposerMicrophoneEnabled(true);
      await onStartVoiceSession();
      await onStartScreenCapture();
    });
  }, [
    composerSpeechActionKind,
    onStartScreenCapture,
    onStartVoiceSession,
    runScreenShareAction,
    setComposerMicrophoneEnabled,
  ]);

  const handleToggleComposerMicrophone = useCallback(async (): Promise<void> => {
    const nextEnabled = !getIsComposerMicrophoneEnabled();
    setComposerMicrophoneEnabled(nextEnabled);

    if (!isVoiceSessionActive) {
      return;
    }

    if (nextEnabled) {
      if (voiceCaptureState === 'capturing') {
        return;
      }

      await onStartVoiceCapture();
      return;
    }

    if (voiceCaptureState === 'idle' || voiceCaptureState === 'stopped') {
      return;
    }

    await onStopVoiceCapture();
  }, [
    getIsComposerMicrophoneEnabled,
    isVoiceSessionActive,
    onStartVoiceCapture,
    onStopVoiceCapture,
    setComposerMicrophoneEnabled,
    voiceCaptureState,
  ]);

  const handleToggleComposerScreenShare = useCallback(async (): Promise<void> => {
    if (composerSpeechActionKind === 'start') {
      await handleStartSpeechModeWithScreen();
      return;
    }

    if (!canToggleScreenContext(controlGatingSnapshot)) {
      return;
    }

    if (isScreenCaptureActive(screenCaptureState)) {
      await onStopScreenCapture();
      return;
    }

    await runScreenShareAction(onStartScreenCapture);
  }, [
    composerSpeechActionKind,
    controlGatingSnapshot,
    handleStartSpeechModeWithScreen,
    onStartScreenCapture,
    onStopScreenCapture,
    runScreenShareAction,
    screenCaptureState,
  ]);

  const handleEndSpeechMode = useCallback(async (): Promise<void> => {
    if (!canEndSpeechMode(controlGatingSnapshot)) {
      return;
    }

    await onEndSpeechMode();
  }, [controlGatingSnapshot, onEndSpeechMode]);

  return {
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
  };
}
