import { create } from 'zustand';
import type { AssistantRuntimeState } from '../state/assistantUiState';
import { LIVE_ADAPTER_KEY } from '../runtime/liveConfig';
import {
  createTextSessionLifecycle,
  deriveSessionPhaseFromLifecycle,
  deriveTransportStateFromLifecycle,
} from '../runtime/textSessionLifecycle';
import type {
  AssistantActivityState,
  ConversationTurnModel,
  RuntimeDebugEvent,
  SessionPhase,
  TextSessionLifecycle,
  TextSessionStatus,
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
  textSessionLifecycle: TextSessionLifecycle;
  activeTransport: TransportKind | null;
  conversationTurns: ConversationTurnModel[];
  lastRuntimeError: string | null;
  lastDebugEvent: RuntimeDebugEvent | null;
};

export type SessionStoreState = SessionStoreData & {
  setAssistantActivity: (assistantActivity: AssistantActivityState) => void;
  setBackendState: (backendState: BackendConnectionState) => void;
  setTokenRequestState: (tokenRequestState: TokenRequestState) => void;
  setTextSessionLifecycle: (textSessionLifecycle: TextSessionLifecycle) => void;
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
  reset: (overrides?: Partial<SessionStoreData>) => void;
};

function withDerivedLifecycleFields(
  textSessionLifecycle: TextSessionLifecycle,
): Pick<SessionStoreData, 'sessionPhase' | 'textSessionLifecycle' | 'transportState'> {
  return {
    sessionPhase: deriveSessionPhaseFromLifecycle(textSessionLifecycle.status),
    textSessionLifecycle,
    transportState: deriveTransportStateFromLifecycle(textSessionLifecycle.status),
  };
}

function buildDefaultSessionState(): SessionStoreData {
  return {
    ...withDerivedLifecycleFields(createTextSessionLifecycle()),
    assistantActivity: 'idle',
    backendState: 'idle',
    tokenRequestState: 'idle',
    activeTransport: null,
    conversationTurns: [],
    lastRuntimeError: null,
    lastDebugEvent: null,
  };
}

function getDebugRuntimeState(
  assistantState: AssistantRuntimeState,
  activeTransport: TransportKind | null,
): Partial<SessionStoreData> {
  if (assistantState === 'disconnected') {
    return {
      ...buildDefaultSessionState(),
    };
  }

  if (assistantState === 'ready') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('ready')),
      assistantActivity: 'idle',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'listening') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('ready')),
      assistantActivity: 'listening',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'thinking') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('connecting')),
      assistantActivity: 'thinking',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  if (assistantState === 'speaking') {
    return {
      ...withDerivedLifecycleFields(createTextSessionLifecycle('receiving')),
      assistantActivity: 'speaking',
      activeTransport: activeTransport ?? LIVE_ADAPTER_KEY,
      lastRuntimeError: null,
    };
  }

  return {
    ...withDerivedLifecycleFields(createTextSessionLifecycle('error')),
    assistantActivity: 'idle',
    lastRuntimeError: 'Runtime forced into error state',
  };
}

export function getTextSessionStatus(
  state: Pick<SessionStoreState, 'textSessionLifecycle'>,
): TextSessionStatus {
  return state.textSessionLifecycle.status;
}

const defaultSessionState = buildDefaultSessionState();

export const useSessionStore = create<SessionStoreState>((set) => ({
  ...defaultSessionState,
  setAssistantActivity: (assistantActivity) => set({ assistantActivity }),
  setBackendState: (backendState) => set({ backendState }),
  setTokenRequestState: (tokenRequestState) => set({ tokenRequestState }),
  setTextSessionLifecycle: (textSessionLifecycle) =>
    set(withDerivedLifecycleFields(textSessionLifecycle)),
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
  reset: (overrides) =>
    set(() => {
      const nextState = {
        ...buildDefaultSessionState(),
        ...overrides,
      };

      if (overrides?.textSessionLifecycle) {
        return {
          ...nextState,
          ...withDerivedLifecycleFields(overrides.textSessionLifecycle),
        };
      }

      return nextState;
    }),
}));
