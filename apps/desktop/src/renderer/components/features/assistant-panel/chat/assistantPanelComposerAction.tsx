import { AudioLines, Loader2, SendHorizonal, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  canEndSpeechMode,
  getComposerSpeechActionKind,
  isSpeechLifecycleActive,
  type ControlGatingSnapshot,
  type SpeechLifecycleStatus,
} from '../../../../runtime';

export type ComposerActionVariant = 'default' | 'speechCircle' | 'speechPill';

export type AssistantPanelComposerAction = {
  disabled: boolean;
  icon: ReactNode;
  isLoading: boolean;
  kind: 'endSpeech' | 'send' | 'startSpeech';
  label: string;
  variant: ComposerActionVariant;
};

export type CreateAssistantPanelComposerActionOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  draftText: string;
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
  localUserSpeechActive: boolean;
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
  localUserSpeechActive,
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
      variant: 'default',
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
              localUserSpeechActive &&
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
      variant: isTransitioning ? 'speechCircle' : 'speechPill',
    };
  }

  if (!isConversationEmpty) {
    return {
      disabled: false,
      icon: (
        <>
          <Undo2 size={14} aria-hidden="true" />
          <span aria-hidden="true">Resume Session</span>
        </>
      ),
      isLoading: false,
      kind: 'startSpeech',
      label: 'Resume Live Session',
      variant: 'speechPill',
    };
  }

  return {
    disabled: false,
    icon: <AudioLines size={18} aria-hidden="true" />,
    isLoading: false,
    kind: 'startSpeech',
    label: 'Start Live Session',
    variant: 'speechCircle',
  };
}
