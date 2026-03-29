import { useMemo } from 'react';
import { selectVisibleConversationTimeline } from '../../../runtime/liveRuntime';
import { useSessionStore } from '../../../store/sessionStore';

export type AssistantPanelConversationState = {
  conversationTurns: ReturnType<typeof selectVisibleConversationTimeline>;
  isConversationEmpty: boolean;
};

export function useAssistantPanelConversationState(): AssistantPanelConversationState {
  const conversationTurns = useSessionStore((state) => state.conversationTurns);
  const transcriptArtifacts = useSessionStore((state) => state.transcriptArtifacts);
  const visibleConversationTurns = useMemo(
    () => selectVisibleConversationTimeline({ conversationTurns, transcriptArtifacts }),
    [conversationTurns, transcriptArtifacts],
  );

  return {
    conversationTurns: visibleConversationTurns,
    isConversationEmpty: visibleConversationTurns.length === 0,
  };
}
