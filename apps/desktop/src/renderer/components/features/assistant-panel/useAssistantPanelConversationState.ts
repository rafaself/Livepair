import { useLiveRuntimeConversationSnapshot } from '../../../runtime/liveRuntime';

export type AssistantPanelConversationState = {
  conversationTurns: ReturnType<typeof useLiveRuntimeConversationSnapshot>['conversationTurns'];
  isConversationEmpty: boolean;
};

export function useAssistantPanelConversationState(): AssistantPanelConversationState {
  return useLiveRuntimeConversationSnapshot();
}
