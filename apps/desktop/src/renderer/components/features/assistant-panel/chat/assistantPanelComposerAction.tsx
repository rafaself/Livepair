import { AudioLines, Loader2, SendHorizonal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  canEndSpeechMode,
  getComposerSpeechActionKind,
  isSpeechLifecycleActive,
  type ControlGatingSnapshot,
  type SpeechLifecycleStatus,
} from '../../../../runtime';

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
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
};

function getEndSpeechModeLabel(speechLifecycleStatus: SpeechLifecycleStatus): string {
  if (speechLifecycleStatus === 'starting') {
    return 'Starting Live session';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Ending Live session';
  }

  return 'End Live session';
}

export function createAssistantPanelComposerAction({
  controlGatingSnapshot,
  draftText,
  isConversationEmpty,
  isComposerDisabled,
  speechLifecycleStatus,
}: CreateAssistantPanelComposerActionOptions): AssistantPanelComposerAction {
  if (
    draftText.trim().length > 0 &&
    isSpeechLifecycleActive(controlGatingSnapshot.speechLifecycleStatus)
  ) {
    return {
      disabled: isComposerDisabled,
      icon: <SendHorizonal size={18} aria-hidden="true" />,
      isLoading: false,
      kind: 'send',
      label: 'Send note to session',
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
          <span
            className={[
              'speech-activity-indicator',
              speechLifecycleStatus === 'userSpeaking' &&
                'speech-activity-indicator--active',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            <span className="speech-activity-indicator__bar" />
            <span className="speech-activity-indicator__bar" />
            <span className="speech-activity-indicator__bar" />
          </span>
          <span aria-hidden="true">End</span>
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
    label: isConversationEmpty ? 'Start Live Session' : 'Resume Live Session',
  };
}
