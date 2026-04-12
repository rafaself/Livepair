import { useCallback } from 'react';

type UseAssistantPanelComposerMediaActionsOptions = {
  composerSpeechActionKind: 'start' | 'end';
  canEndSpeechMode: boolean;
  canToggleScreenContext: boolean;
  getIsComposerMicrophoneEnabled: () => boolean;
  setComposerMicrophoneEnabled: (enabled: boolean) => void;
  screenShareModeGate?: (action: () => Promise<void>) => Promise<boolean | void>;
  onStartSpeechMode: () => Promise<boolean | void>;
  onStartSpeechModeWithScreenShare: () => Promise<boolean | void>;
  onSetComposerMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  onToggleScreenCapture: () => Promise<boolean | void>;
  onEndSpeechMode: () => Promise<boolean | void>;
};

export type AssistantPanelComposerMediaActions = {
  handleStartSpeechMode: () => Promise<void>;
  handleStartSpeechModeWithScreen: () => Promise<boolean>;
  handleToggleComposerMicrophone: () => Promise<void>;
  handleToggleComposerScreenShare: () => Promise<void>;
  handleEndSpeechMode: () => Promise<void>;
};

export function useAssistantPanelComposerMediaActions({
  composerSpeechActionKind,
  canEndSpeechMode,
  canToggleScreenContext,
  getIsComposerMicrophoneEnabled,
  setComposerMicrophoneEnabled,
  screenShareModeGate,
  onStartSpeechMode,
  onStartSpeechModeWithScreenShare,
  onSetComposerMicrophoneEnabled,
  onToggleScreenCapture,
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
    await onStartSpeechMode();
  }, [composerSpeechActionKind, onStartSpeechMode, setComposerMicrophoneEnabled]);

  const handleStartSpeechModeWithScreen = useCallback(async (): Promise<boolean> => {
    if (composerSpeechActionKind !== 'start') {
      return false;
    }

    return runScreenShareAction(async () => {
      setComposerMicrophoneEnabled(true);
      await onStartSpeechModeWithScreenShare();
    });
  }, [
    composerSpeechActionKind,
    onStartSpeechModeWithScreenShare,
    runScreenShareAction,
    setComposerMicrophoneEnabled,
  ]);

  const handleToggleComposerMicrophone = useCallback(async (): Promise<void> => {
    const nextEnabled = !getIsComposerMicrophoneEnabled();
    setComposerMicrophoneEnabled(nextEnabled);
    await onSetComposerMicrophoneEnabled(nextEnabled);
  }, [
    getIsComposerMicrophoneEnabled,
    onSetComposerMicrophoneEnabled,
    setComposerMicrophoneEnabled,
  ]);

  const handleToggleComposerScreenShare = useCallback(async (): Promise<void> => {
    if (composerSpeechActionKind === 'start') {
      await handleStartSpeechModeWithScreen();
      return;
    }

    if (!canToggleScreenContext) {
      return;
    }

    await runScreenShareAction(async () => {
      await onToggleScreenCapture();
    });
  }, [
    canToggleScreenContext,
    composerSpeechActionKind,
    handleStartSpeechModeWithScreen,
    onToggleScreenCapture,
    runScreenShareAction,
  ]);

  const handleEndSpeechMode = useCallback(async (): Promise<void> => {
    if (!canEndSpeechMode) {
      return;
    }

    await onEndSpeechMode();
  }, [canEndSpeechMode, onEndSpeechMode]);

  return {
    handleStartSpeechMode,
    handleStartSpeechModeWithScreen,
    handleToggleComposerMicrophone,
    handleToggleComposerScreenShare,
    handleEndSpeechMode,
  };
}
