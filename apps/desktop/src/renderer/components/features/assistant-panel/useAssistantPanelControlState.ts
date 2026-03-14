import { useMemo } from 'react';
import {
  createControlGatingSnapshot,
  getComposerSpeechActionKind,
  type ControlGatingSnapshot,
  type ProductMode,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TextSessionStatus,
  type TransportKind,
  type VoiceCaptureState,
  type VoiceSessionStatus,
} from '../../../runtime';

type UseAssistantPanelControlStateOptions = {
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  activeTransport: TransportKind | null;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
};

export type AssistantPanelControlState = {
  controlGatingSnapshot: ControlGatingSnapshot;
  composerSpeechActionKind: ReturnType<typeof getComposerSpeechActionKind>;
};

export function useAssistantPanelControlState({
  currentMode,
  speechLifecycleStatus,
  textSessionStatus,
  activeTransport,
  voiceSessionStatus,
  voiceCaptureState,
  screenCaptureState,
}: UseAssistantPanelControlStateOptions): AssistantPanelControlState {
  const controlGatingSnapshot = useMemo(
    () =>
      createControlGatingSnapshot({
        currentMode,
        speechLifecycleStatus,
        textSessionStatus,
        activeTransport,
        voiceSessionStatus,
        voiceCaptureState,
        screenCaptureState,
      }),
    [
      activeTransport,
      currentMode,
      screenCaptureState,
      speechLifecycleStatus,
      textSessionStatus,
      voiceCaptureState,
      voiceSessionStatus,
    ],
  );

  return {
    controlGatingSnapshot,
    composerSpeechActionKind: getComposerSpeechActionKind(controlGatingSnapshot),
  };
}
