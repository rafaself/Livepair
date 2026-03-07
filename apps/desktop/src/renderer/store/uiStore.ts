import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { AssistantRuntimeState } from '../state/assistantUiState';

export type AssistantState = AssistantRuntimeState;

export type UiState = {
  isPanelOpen: boolean;
  isSettingsOpen: boolean;
  assistantState: AssistantState;
};

type UiAction =
  | { type: 'togglePanel' }
  | { type: 'closePanel' }
  | { type: 'openSettings' }
  | { type: 'closeSettings' }
  | { type: 'setAssistantState'; payload: AssistantState };

const initialUiState: UiState = {
  isPanelOpen: false,
  isSettingsOpen: false,
  assistantState: 'disconnected',
};

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'togglePanel': {
      if (state.isPanelOpen) {
        return {
          ...state,
          isPanelOpen: false,
          isSettingsOpen: false,
        };
      }

      return {
        ...state,
        isPanelOpen: true,
      };
    }
    case 'closePanel': {
      return {
        ...state,
        isPanelOpen: false,
        isSettingsOpen: false,
      };
    }
    case 'openSettings': {
      return {
        ...state,
        isSettingsOpen: true,
      };
    }
    case 'closeSettings': {
      return {
        ...state,
        isSettingsOpen: false,
      };
    }
    case 'setAssistantState': {
      return {
        ...state,
        assistantState: action.payload,
      };
    }
    default: {
      return state;
    }
  }
}

type UiStoreValue = {
  state: UiState;
  togglePanel: () => void;
  closePanel: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setAssistantState: (state: AssistantState) => void;
};

const UiStoreContext = createContext<UiStoreValue | undefined>(undefined);

export type UiStoreProviderProps = {
  children: ReactNode;
};

export function UiStoreProvider({ children }: UiStoreProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(uiReducer, initialUiState);
  const togglePanel = useCallback(() => dispatch({ type: 'togglePanel' }), []);
  const closePanel = useCallback(() => dispatch({ type: 'closePanel' }), []);
  const openSettings = useCallback(() => dispatch({ type: 'openSettings' }), []);
  const closeSettings = useCallback(() => dispatch({ type: 'closeSettings' }), []);
  const setAssistantState = useCallback(
    (assistantState: AssistantState) =>
      dispatch({ type: 'setAssistantState', payload: assistantState }),
    [],
  );

  const value = useMemo<UiStoreValue>(
    () => ({
      state,
      togglePanel,
      closePanel,
      openSettings,
      closeSettings,
      setAssistantState,
    }),
    [closePanel, closeSettings, openSettings, setAssistantState, state, togglePanel],
  );

  return createElement(UiStoreContext.Provider, { value }, children);
}

export function useUiStore(): UiStoreValue {
  const context = useContext(UiStoreContext);

  if (!context) {
    throw new Error('useUiStore must be used within UiStoreProvider');
  }

  return context;
}
