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
import {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
} from '../../shared/backendBaseUrl';
import { THEME_PREFERENCE_STORAGE_KEY, type ThemePreference } from '../theme';

export type AssistantState = AssistantRuntimeState;
export type PanelView = 'chat' | 'settings' | 'debug';
export type PreferredMode = 'fast' | 'thinking';

export type UiState = {
  isPanelOpen: boolean;
  isPanelPinned: boolean;
  isDebugMode: boolean;
  panelView: PanelView;
  assistantState: AssistantState;
  preferredMode: PreferredMode;
  backendUrl: string;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  themePreference: ThemePreference;
};

type UiAction =
  | { type: 'togglePanel' }
  | { type: 'closePanel' }
  | { type: 'togglePanelPinned' }
  | { type: 'toggleDebugMode' }
  | { type: 'setPanelView'; payload: PanelView }
  | { type: 'setAssistantState'; payload: AssistantState }
  | { type: 'setPreferredMode'; payload: PreferredMode }
  | { type: 'setBackendUrl'; payload: string }
  | { type: 'setSelectedInputDeviceId'; payload: string }
  | { type: 'setSelectedOutputDeviceId'; payload: string }
  | { type: 'setThemePreference'; payload: ThemePreference };

const INPUT_DEVICE_STORAGE_KEY = 'livepair.selectedInputDeviceId';
const OUTPUT_DEVICE_STORAGE_KEY = 'livepair.selectedOutputDeviceId';
const BACKEND_URL_STORAGE_KEY = 'livepair.backendUrl';

const defaultUiState: UiState = {
  isPanelOpen: false,
  isPanelPinned: false,
  isDebugMode: false,
  panelView: 'chat',
  assistantState: 'disconnected',
  preferredMode: 'fast',
  backendUrl: DEFAULT_API_BASE_URL,
  selectedInputDeviceId: 'default',
  selectedOutputDeviceId: 'default',
  themePreference: 'system',
};

function getInitialUiState(): UiState {
  if (typeof window === 'undefined') {
    return defaultUiState;
  }

  const storedInputDeviceId = window.localStorage.getItem(INPUT_DEVICE_STORAGE_KEY);
  const storedOutputDeviceId = window.localStorage.getItem(OUTPUT_DEVICE_STORAGE_KEY);
  const storedBackendUrl = normalizeBackendBaseUrl(
    window.localStorage.getItem(BACKEND_URL_STORAGE_KEY) ?? '',
  );
  const storedThemePreference = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);

  return {
    ...defaultUiState,
    backendUrl: storedBackendUrl ?? defaultUiState.backendUrl,
    selectedInputDeviceId: storedInputDeviceId || defaultUiState.selectedInputDeviceId,
    selectedOutputDeviceId: storedOutputDeviceId || defaultUiState.selectedOutputDeviceId,
    themePreference:
      storedThemePreference === 'system' ||
      storedThemePreference === 'light' ||
      storedThemePreference === 'dark'
        ? storedThemePreference
        : defaultUiState.themePreference,
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
    case 'toggleDebugMode': {
      return {
        ...state,
        isDebugMode: !state.isDebugMode,
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
    case 'setBackendUrl': {
      return {
        ...state,
        backendUrl: action.payload,
      };
    }
    case 'setSelectedInputDeviceId': {
      return {
        ...state,
        selectedInputDeviceId: action.payload,
      };
    }
    case 'setSelectedOutputDeviceId': {
      return {
        ...state,
        selectedOutputDeviceId: action.payload,
      };
    }
    case 'setThemePreference': {
      return {
        ...state,
        themePreference: action.payload,
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
  toggleDebugMode: () => void;
  setPanelView: (view: PanelView) => void;
  setAssistantState: (state: AssistantState) => void;
  setPreferredMode: (mode: PreferredMode) => void;
  setBackendUrl: (url: string) => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
};

const UiStoreContext = createContext<UiStoreValue | undefined>(undefined);

export type UiStoreProviderProps = {
  children: ReactNode;
};

export function UiStoreProvider({ children }: UiStoreProviderProps): JSX.Element {
  const [state, dispatch] = useReducer(uiReducer, undefined, getInitialUiState);
  const initialPersistedBackendUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return normalizeBackendBaseUrl(window.localStorage.getItem(BACKEND_URL_STORAGE_KEY) ?? '');
  }, []);
  const togglePanel = useCallback(() => dispatch({ type: 'togglePanel' }), []);
  const closePanel = useCallback(() => dispatch({ type: 'closePanel' }), []);
  const togglePanelPinned = useCallback(() => dispatch({ type: 'togglePanelPinned' }), []);
  const toggleDebugMode = useCallback(() => dispatch({ type: 'toggleDebugMode' }), []);
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
  const setBackendUrl = useCallback(
    (backendUrl: string) => dispatch({ type: 'setBackendUrl', payload: backendUrl }),
    [],
  );
  const setSelectedInputDeviceId = useCallback(
    (selectedInputDeviceId: string) =>
      dispatch({ type: 'setSelectedInputDeviceId', payload: selectedInputDeviceId }),
    [],
  );
  const setSelectedOutputDeviceId = useCallback(
    (selectedOutputDeviceId: string) =>
      dispatch({ type: 'setSelectedOutputDeviceId', payload: selectedOutputDeviceId }),
    [],
  );
  const setThemePreference = useCallback(
    (themePreference: ThemePreference) =>
      dispatch({ type: 'setThemePreference', payload: themePreference }),
    [],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(INPUT_DEVICE_STORAGE_KEY, state.selectedInputDeviceId);
  }, [state.selectedInputDeviceId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(OUTPUT_DEVICE_STORAGE_KEY, state.selectedOutputDeviceId);
  }, [state.selectedOutputDeviceId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, state.backendUrl);
  }, [state.backendUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, state.themePreference);
  }, [state.themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isDisposed = false;

    const syncBackendUrl = async (): Promise<void> => {
      const runtimeBackendUrl = normalizeBackendBaseUrl(await window.bridge.getBackendBaseUrl())
        ?? DEFAULT_API_BASE_URL;

      if (isDisposed) {
        return;
      }

      if (!initialPersistedBackendUrl) {
        setBackendUrl(runtimeBackendUrl);
        return;
      }

      if (initialPersistedBackendUrl === runtimeBackendUrl) {
        setBackendUrl(runtimeBackendUrl);
        return;
      }

      try {
        const appliedBackendUrl = normalizeBackendBaseUrl(
          await window.bridge.setBackendBaseUrl(initialPersistedBackendUrl),
        ) ?? runtimeBackendUrl;

        if (!isDisposed) {
          setBackendUrl(appliedBackendUrl);
        }
      } catch {
        if (!isDisposed) {
          setBackendUrl(runtimeBackendUrl);
        }
      }
    };

    void syncBackendUrl();

    return () => {
      isDisposed = true;
    };
  }, [initialPersistedBackendUrl, setBackendUrl]);

  const value = useMemo<UiStoreValue>(
    () => ({
      state,
      togglePanel,
      closePanel,
      togglePanelPinned,
      toggleDebugMode,
      setPanelView,
      setAssistantState,
      setPreferredMode,
      setBackendUrl,
      setSelectedInputDeviceId,
      setSelectedOutputDeviceId,
      setThemePreference,
    }),
    [
      closePanel,
      setPanelView,
      setAssistantState,
      setPreferredMode,
      setBackendUrl,
      setSelectedInputDeviceId,
      setSelectedOutputDeviceId,
      setThemePreference,
      state,
      togglePanel,
      toggleDebugMode,
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
