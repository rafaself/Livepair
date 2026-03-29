import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { canSubmitComposerText, type ControlGatingSnapshot } from '../../../runtime/liveRuntime';

type UseAssistantPanelTextComposerOptions = {
  controlGatingSnapshot: ControlGatingSnapshot;
  onSubmitTextTurn: (draftText: string) => Promise<boolean>;
};

export type AssistantPanelTextComposer = {
  draftText: string;
  isSubmittingTextTurn: boolean;
  handleDraftTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmitTextTurn: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function useAssistantPanelTextComposer({
  controlGatingSnapshot,
  onSubmitTextTurn,
}: UseAssistantPanelTextComposerOptions): AssistantPanelTextComposer {
  const [draftText, setDraftText] = useState('');
  const [isSubmittingTextTurn, setIsSubmittingTextTurn] = useState(false);

  const handleDraftTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraftText(event.currentTarget.value);
  }, []);

  const handleSubmitTextTurn = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const nextDraft = draftText.trim();

      if (
        !nextDraft ||
        isSubmittingTextTurn ||
        !canSubmitComposerText(controlGatingSnapshot)
      ) {
        return;
      }

      setIsSubmittingTextTurn(true);

      try {
        const didSend = await onSubmitTextTurn(nextDraft);

        if (didSend) {
          setDraftText('');
        }
      } finally {
        setIsSubmittingTextTurn(false);
      }
    },
    [controlGatingSnapshot, draftText, isSubmittingTextTurn, onSubmitTextTurn],
  );

  return {
    draftText,
    isSubmittingTextTurn,
    handleDraftTextChange,
    handleSubmitTextTurn,
  };
}
