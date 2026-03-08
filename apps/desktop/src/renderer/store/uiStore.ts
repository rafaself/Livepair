import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type { AssistantRuntimeState } from '../state/assistantUiState';

export type AssistantState = AssistantRuntimeState;
export type PanelView = 'chat' | 'settings' | 'debug';
export type PreferredMode = 'fast' | 'thinking';

export type UiState = {
  isPanelOpen: boolean;
  isPanelPinned: boolean;
  panelView: PanelView;
  assistantState: AssistantState;
  preferredMode: PreferredMode;
  selectedInputDeviceId: string;
};

type UiAction =
  | { type: 'togglePanel' }
  | { type: 'closePanel' }
  | { type: 'togglePanelPinned' }
  | { type: 'setPanelView'; payload: PanelView }
  | { type: 'setAssistantState'; payload: AssistantState }
  | { type: 'setPreferredMode'; payload: PreferredMode }
  | { type: 'setSelectedInputDeviceId'; payload: string };

const INPUT_DEVICE_STORAGE_KEY = 'livepair.selectedInputDeviceId';

const defaultUiState: UiState = {
  isPanelOpen: false,
  isPanelPinned: false,
  panelView: 'chat',
  assistantState: 'disconnected',
  preferredMode: 'fast',
  selectedInputDeviceId: 'default',
};

function getInitialUiState(): UiState {
  if (typeof window === 'undefined') {
    return defaultUiState;
  }

  const storedInputDeviceId = window.localStorage.getItem(INPUT_DEVICE_STORAGE_KEY);

  return {
    ...defaultUiState,
    selectedInputDeviceId: storedInputDeviceId || defaultUiState.selectedInputDeviceId,
  };
}

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
    case 'setPreferredMode': {
      return {
        ...state,
        preferredMode: action.payload,
      };
    }
    case 'setSelectedInputDeviceId': {
      return {
        ...state,
        selectedInputDeviceId: action.payload,
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
  setPreferredMode: (mode: PreferredMode) => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
};

const UiStoreContext = createContext<UiStoreValue | undefined>(undefined);

export type UiStoreProviderProps = {
  children: ReactNode;
};

export function UiStoreProvider({ children }: UiStoreProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(uiReducer, undefined, getInitialUiState);
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
  const setPreferredMode = useCallback(
    (preferredMode: PreferredMode) => dispatch({ type: 'setPreferredMode', payload: preferredMode }),
    [],
  );
  const setSelectedInputDeviceId = useCallback(
    (selectedInputDeviceId: string) =>
      dispatch({ type: 'setSelectedInputDeviceId', payload: selectedInputDeviceId }),
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(INPUT_DEVICE_STORAGE_KEY, state.selectedInputDeviceId);
  }, [state.selectedInputDeviceId]);

  const value = useMemo<UiStoreValue>(
    () => ({
      state,
      togglePanel,
      closePanel,
      togglePanelPinned,
      setPanelView,
      setAssistantState,
      setPreferredMode,
      setSelectedInputDeviceId,
    }),
    [
      closePanel,
      setPanelView,
      setAssistantState,
      setPreferredMode,
      setSelectedInputDeviceId,
      state,
      togglePanel,
      togglePanelPinned,
    ],
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
