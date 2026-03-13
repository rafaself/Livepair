import { AudioLines, Loader2, SendHorizonal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  canEndSpeechMode,
  getComposerSpeechActionKind,
  shouldShowSpeechControls,
} from '../../runtime/controlGating';
import type { ControlGatingSnapshot } from '../../runtime/controlGating';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';

export type AssistantPanelComposerAction = {
  disabled: boolean;
  icon: ReactNode;
  isLoading: boolean;
  kind: 'endSpeech' | 'send' | 'startSpeech';
  label: string;
};

export type CreateAssistantPanelComposerActionOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  draftText: string;
  hasConversationHistory: boolean;
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
  hasConversationHistory,
  isComposerDisabled,
  speechLifecycleStatus,
}: CreateAssistantPanelComposerActionOptions): AssistantPanelComposerAction {
  if (shouldShowSpeechControls(controlGatingSnapshot) && draftText.trim().length > 0) {
    return {
      disabled: isComposerDisabled,
      icon: <SendHorizonal size={18} aria-hidden="true" />,
      isLoading: false,
      kind: 'send',
      label: 'Send message',
    };
  }

  if (getComposerSpeechActionKind(controlGatingSnapshot) === 'end') {
    const isTransitioning =
      speechLifecycleStatus === 'starting' || speechLifecycleStatus === 'ending';
    return {
      disabled: !canEndSpeechMode(controlGatingSnapshot),
      icon: isTransitioning ? (
        <Loader2 size={18} aria-hidden="true" />
      ) : (
        <>
          <span aria-hidden="true">End</span>
          <AudioLines size={18} aria-hidden="true" />
        </>
      ),
      isLoading: isTransitioning,
      kind: 'endSpeech',
      label: getEndSpeechModeLabel(speechLifecycleStatus),
    };
  }

  return {
    disabled: false,
    icon: <AudioLines size={18} aria-hidden="true" />,
    isLoading: false,
    kind: 'startSpeech',
    label: hasConversationHistory ? 'Resume Live Session' : 'Start Live Session',
  };
}
