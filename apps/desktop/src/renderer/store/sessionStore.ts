import { create } from 'zustand';
import type { AssistantRuntimeState } from '../state/assistantUiState';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

type SessionStoreState = {
  assistantState: AssistantRuntimeState;
  backendState: BackendConnectionState;
  tokenRequestState: TokenRequestState;
  setAssistantState: (assistantState: AssistantRuntimeState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  reset: () => void;
};

const defaultSessionState = {
  assistantState: 'disconnected' as AssistantRuntimeState,
  backendState: 'idle' as BackendConnectionState,
  tokenRequestState: 'idle' as TokenRequestState,
};

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...defaultSessionState,
  setAssistantState: (assistantState) => set({ assistantState }),
  setBackendState: (backendState) => set({ backendState }),
  setTokenRequestState: (tokenRequestState) => set({ tokenRequestState }),
  reset: () => set(defaultSessionState),
}));
