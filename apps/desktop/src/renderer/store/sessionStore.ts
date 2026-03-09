import { create } from 'zustand';
import type { AssistantRuntimeState } from '../state/assistantUiState';
import type {
  AssistantActivityState,
  ConversationTurnModel,
  RuntimeDebugEvent,
  SessionPhase,
  TransportConnectionState,
  TransportKind,
} from '../runtime/types';

export type BackendConnectionState = 'idle' | 'checking' | 'connected' | 'failed';
export type TokenRequestState = 'idle' | 'loading' | 'success' | 'error';

type SessionStoreData = {
  sessionPhase: SessionPhase;
  assistantActivity: AssistantActivityState;
  backendState: BackendConnectionState;
  tokenRequestState: TokenRequestState;
  transportState: TransportConnectionState;
  activeTransport: TransportKind | null;
  conversationTurns: ConversationTurnModel[];
  lastRuntimeError: string | null;
  lastDebugEvent: RuntimeDebugEvent | null;
};

export type SessionStoreState = SessionStoreData & {
  setSessionPhase: (sessionPhase: SessionPhase) => void;
  setAssistantActivity: (assistantActivity: AssistantActivityState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  setTransportState: (transportState: TransportConnectionState) => void;
  setActiveTransport: (activeTransport: TransportKind | null) => void;
  appendConversationTurn: (turn: ConversationTurnModel) => void;
  updateConversationTurn: (
    turnId: string,
    patch: Pick<ConversationTurnModel, 'content' | 'state' | 'statusLabel'>,
  ) => void;
  clearConversationTurns: () => void;
  setLastRuntimeError: (lastRuntimeError: string | null) => void;
  setLastDebugEvent: (lastDebugEvent: RuntimeDebugEvent | null) => void;
  setAssistantState: (assistantState: AssistantRuntimeState) => void;
  reset: () => void;
};

const defaultSessionState: SessionStoreData = {
  sessionPhase: 'idle',
  assistantActivity: 'idle',
  backendState: 'idle',
  tokenRequestState: 'idle',
  transportState: 'idle',
  activeTransport: null,
  conversationTurns: [],
  lastRuntimeError: null,
  lastDebugEvent: null,
};

function getDebugRuntimeState(
  assistantState: AssistantRuntimeState,
  activeTransport: TransportKind | null,
): Partial<SessionStoreData> {
  if (assistantState === 'disconnected') {
    return {
      ...defaultSessionState,
    };
  }

  if (assistantState === 'ready') {
    return {
      sessionPhase: 'active',
      assistantActivity: 'idle',
      transportState: 'connected',
      activeTransport: activeTransport ?? 'mock',
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'listening') {
    return {
      sessionPhase: 'active',
      assistantActivity: 'listening',
      transportState: 'connected',
      activeTransport: activeTransport ?? 'mock',
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'thinking') {
    return {
      sessionPhase: 'starting',
      assistantActivity: 'thinking',
      transportState: 'connecting',
      activeTransport: activeTransport ?? 'mock',
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'speaking') {
    return {
      sessionPhase: 'active',
      assistantActivity: 'speaking',
      transportState: 'connected',
      activeTransport: activeTransport ?? 'mock',
      lastRuntimeError: null,
    };
  }

  return {
    sessionPhase: 'error',
    assistantActivity: 'idle',
    lastRuntimeError: 'Runtime forced into error state',
  };
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...defaultSessionState,
  setSessionPhase: (sessionPhase) => set({ sessionPhase }),
  setAssistantActivity: (assistantActivity) => set({ assistantActivity }),
  setBackendState: (backendState) => set({ backendState }),
  setTokenRequestState: (tokenRequestState) => set({ tokenRequestState }),
  setTransportState: (transportState) => set({ transportState }),
  setActiveTransport: (activeTransport) => set({ activeTransport }),
  appendConversationTurn: (turn) =>
    set((state) => ({
      conversationTurns: [...state.conversationTurns, turn],
    })),
  updateConversationTurn: (turnId, patch) =>
    set((state) => ({
      conversationTurns: state.conversationTurns.map((turn) =>
        turn.id === turnId ? { ...turn, ...patch } : turn,
      ),
    })),
  clearConversationTurns: () => set({ conversationTurns: [] }),
  setLastRuntimeError: (lastRuntimeError) => set({ lastRuntimeError }),
  setLastDebugEvent: (lastDebugEvent) => set({ lastDebugEvent }),
  setAssistantState: (assistantState) =>
    set((state) => getDebugRuntimeState(assistantState, state.activeTransport)),
  reset: () => set(defaultSessionState),
}));
