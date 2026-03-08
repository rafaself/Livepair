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
export type PanelView = 'chat' | 'settings' | 'debug';

export type UiState = {
  isPanelOpen: boolean;
  isPanelPinned: boolean;
  panelView: PanelView;
  assistantState: AssistantState;
};

type UiAction =
  | { type: 'togglePanel' }
  | { type: 'closePanel' }
  | { type: 'togglePanelPinned' }
  | { type: 'setPanelView'; payload: PanelView }
  | { type: 'setAssistantState'; payload: AssistantState };

const initialUiState: UiState = {
  isPanelOpen: false,
  isPanelPinned: false,
  panelView: 'chat',
  assistantState: 'disconnected',
};

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'togglePanel': {
      if (state.isPanelOpen) {
        return {
          ...state,
          isPanelOpen: false,
          panelView: 'chat',
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
        panelView: 'chat',
      };
    }
    case 'togglePanelPinned': {
      return {
        ...state,
        isPanelPinned: !state.isPanelPinned,
      };
    }
    case 'setPanelView': {
      return {
        ...state,
        panelView: action.payload,
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
  togglePanelPinned: () => void;
  setPanelView: (view: PanelView) => void;
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
  const togglePanelPinned = useCallback(() => dispatch({ type: 'togglePanelPinned' }), []);
  const setPanelView = useCallback(
    (view: PanelView) => dispatch({ type: 'setPanelView', payload: view }),
    [],
  );
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
      togglePanelPinned,
      setPanelView,
      setAssistantState,
    }),
    [closePanel, setPanelView, setAssistantState, state, togglePanel, togglePanelPinned],
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
