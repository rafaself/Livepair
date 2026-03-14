import { useCallback, useEffect, useRef } from 'react';
import {
  canEndSpeechMode,
  canToggleScreenContext,
  type ControlGatingSnapshot,
  type ScreenCaptureState,
  type VoiceCaptureState,
  type VoiceSessionStatus,
} from '../../../runtime';

type UseAssistantPanelComposerMediaActionsOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  composerSpeechActionKind: 'start' | 'end';
  getIsComposerMicrophoneEnabled: () => boolean;
  setComposerMicrophoneEnabled: (enabled: boolean) => void;
  isVoiceSessionActive: boolean;
  voiceCaptureState: VoiceCaptureState;
  voiceSessionStatus: VoiceSessionStatus;
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
  handleStartSpeechModeWithScreen: () => Promise<void>;
  handleToggleComposerMicrophone: () => Promise<void>;
  handleToggleComposerScreenShare: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

function isVoiceSessionReadyForScreenCapture(voiceSessionStatus: VoiceSessionStatus): boolean {
  return (
    voiceSessionStatus === 'ready' ||
    voiceSessionStatus === 'capturing' ||
    voiceSessionStatus === 'streaming'
  );
}

function isScreenCaptureActive(screenCaptureState: ScreenCaptureState): boolean {
  return (
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing' ||
    screenCaptureState === 'streaming'
  );
}

export function useAssistantPanelComposerMediaActions({
  controlGatingSnapshot,
  composerSpeechActionKind,
  getIsComposerMicrophoneEnabled,
  setComposerMicrophoneEnabled,
  isVoiceSessionActive,
  voiceCaptureState,
  voiceSessionStatus,
  screenCaptureState,
  onStartVoiceSession,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onStartScreenCapture,
  onStopScreenCapture,
  onEndSpeechMode,
}: UseAssistantPanelComposerMediaActionsOptions): AssistantPanelComposerMediaActions {
  const pendingScreenShareRef = useRef(false);

  useEffect(() => {
    if (
      pendingScreenShareRef.current &&
      isVoiceSessionReadyForScreenCapture(voiceSessionStatus)
    ) {
      pendingScreenShareRef.current = false;
      void onStartScreenCapture();
    }
  }, [onStartScreenCapture, voiceSessionStatus]);

  const stopVoiceCaptureIfMicrophoneDisabled = useCallback(async (): Promise<void> => {
    if (!getIsComposerMicrophoneEnabled()) {
      await onStopVoiceCapture();
    }
  }, [getIsComposerMicrophoneEnabled, onStopVoiceCapture]);

  const handleStartSpeechMode = useCallback(async (): Promise<void> => {
    if (composerSpeechActionKind !== 'start') {
      return;
    }

    await onStartVoiceSession();
    await stopVoiceCaptureIfMicrophoneDisabled();
  }, [composerSpeechActionKind, onStartVoiceSession, stopVoiceCaptureIfMicrophoneDisabled]);

  const handleStartSpeechModeWithScreen = useCallback(async (): Promise<void> => {
    if (composerSpeechActionKind !== 'start') {
      return;
    }

    pendingScreenShareRef.current = true;
    await onStartVoiceSession();
    await stopVoiceCaptureIfMicrophoneDisabled();
  }, [composerSpeechActionKind, onStartVoiceSession, stopVoiceCaptureIfMicrophoneDisabled]);

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

    await onStartScreenCapture();
  }, [
    composerSpeechActionKind,
    controlGatingSnapshot,
    handleStartSpeechModeWithScreen,
    onStartScreenCapture,
    onStopScreenCapture,
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
