import { useDomainRuntimeConversationSnapshot } from '../../../runtime/domainRuntimeContract';

export type AssistantPanelConversationState = {
  conversationTurns: ReturnType<typeof useDomainRuntimeConversationSnapshot>['conversationTurns'];
  isConversationEmpty: boolean;
};

export function useAssistantPanelConversationState(): AssistantPanelConversationState {
  return useDomainRuntimeConversationSnapshot();
}
