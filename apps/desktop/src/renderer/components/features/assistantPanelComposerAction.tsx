import { Mic, MicOff, SendHorizonal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  canEndSpeechMode,
  getComposerSpeechActionKind,
} from '../../runtime/controlGating';
import type { ControlGatingSnapshot } from '../../runtime/controlGating';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';

export type AssistantPanelComposerAction = {
  disabled: boolean;
  icon: ReactNode;
  kind: 'endSpeech' | 'send' | 'startSpeech';
  label: string;
};

export type CreateAssistantPanelComposerActionOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  draftText: string;
  isComposerDisabled: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
};

function getEndSpeechModeLabel(speechLifecycleStatus: SpeechLifecycleStatus): string {
  if (speechLifecycleStatus === 'starting') {
    return 'Starting speech mode';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Ending speech mode';
  }

  return 'End speech mode';
}

export function createAssistantPanelComposerAction({
  controlGatingSnapshot,
  draftText,
  isComposerDisabled,
  speechLifecycleStatus,
}: CreateAssistantPanelComposerActionOptions): AssistantPanelComposerAction {
  if (draftText.trim().length > 0) {
    return {
      disabled: isComposerDisabled,
      icon: <SendHorizonal size={18} aria-hidden="true" />,
      kind: 'send',
      label: 'Send message',
    };
  }

  if (getComposerSpeechActionKind(controlGatingSnapshot) === 'end') {
    return {
      disabled: !canEndSpeechMode(controlGatingSnapshot),
      icon: <MicOff size={18} aria-hidden="true" />,
      kind: 'endSpeech',
      label: getEndSpeechModeLabel(speechLifecycleStatus),
    };
  }

  return {
    disabled: false,
    icon: <Mic size={18} aria-hidden="true" />,
    kind: 'startSpeech',
    label: 'Start speech mode',
  };
}
