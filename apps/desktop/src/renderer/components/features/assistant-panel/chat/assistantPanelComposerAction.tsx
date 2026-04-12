import { AudioLines, Loader2, SendHorizonal, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { type SpeechLifecycleStatus } from '../../../../runtime/liveRuntime';
import { SpeechActivityIndicator } from '../SpeechActivityIndicator';

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
  controlGatingSnapshot?: unknown;
  draftText: string;
  isConversationEmpty: boolean;
  isComposerDisabled: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
  localUserSpeechActive: boolean;
  sessionActionKind?: 'start' | 'end';
  canEndSpeechMode?: boolean;
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
  draftText,
  isConversationEmpty,
  isComposerDisabled,
  speechLifecycleStatus,
  localUserSpeechActive,
  sessionActionKind = 'start',
  canEndSpeechMode = false,
}: CreateAssistantPanelComposerActionOptions): AssistantPanelComposerAction {
  if (draftText.trim().length > 0 && sessionActionKind === 'end') {
    return {
      disabled: isComposerDisabled,
      icon: <SendHorizonal size={18} aria-hidden="true" />,
      isLoading: false,
      kind: 'send',
      label: 'Send note to session',
      variant: 'default',
    };
  }

  if (sessionActionKind === 'end') {
    const isTransitioning =
      speechLifecycleStatus === 'starting' || speechLifecycleStatus === 'ending';
    return {
      disabled: !canEndSpeechMode,
      icon: isTransitioning ? (
        <Loader2 size={18} aria-hidden="true" />
      ) : (
        <>
          <SpeechActivityIndicator isActive={localUserSpeechActive || speechLifecycleStatus === 'userSpeaking'} />
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
