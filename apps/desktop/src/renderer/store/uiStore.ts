import { create } from 'zustand';
import type {
  DesktopDisplayOption,
  OverlayWindowState,
} from '../../shared/desktopBridge';
import { PRIMARY_DISPLAY_ID } from '../../shared/settings';
import type { SelectOptionItem } from '../components/primitives';
import { useSettingsStore } from './settingsStore';

export type PanelView = 'chat' | 'settings' | 'debug';
export type SettingsFocusTarget = 'capture-display' | 'overlay-display';
export type SettingsIssue = {
  id: 'missing-capture-display' | 'missing-overlay-display';
  severity: 'warning';
  summary: string;
  focusTarget: SettingsFocusTarget;
};

const DEFAULT_DEVICE_ID = 'default';
const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No speaker detected' },
];

function buildDeviceOptions(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  unavailableOptions: readonly SelectOptionItem[],
  unnamedLabelPrefix: string,
): readonly SelectOptionItem[] {
  const matchingDevices = devices.filter((device) => device.kind === kind);

  if (matchingDevices.length === 0) {
    return unavailableOptions;
  }

  let unnamedDeviceCount = 0;

  return [
    { value: DEFAULT_DEVICE_ID, label: 'System default' },
    ...matchingDevices.flatMap((device) => {
      if (device.deviceId === DEFAULT_DEVICE_ID) {
        return [];
      }

      const label = device.label || `${unnamedLabelPrefix} ${++unnamedDeviceCount}`;

      return [{ value: device.deviceId, label }];
    }),
  ];
}

function buildDisplayIssues(
  displayOptions: readonly DesktopDisplayOption[],
): readonly SettingsIssue[] {
  const {
    selectedCaptureDisplayId,
    selectedOverlayDisplayId,
  } = useSettingsStore.getState().settings;
  const availableDisplayIds = new Set(displayOptions.map((option) => option.id));
  const issues: SettingsIssue[] = [];

  if (
    selectedCaptureDisplayId !== PRIMARY_DISPLAY_ID &&
    !availableDisplayIds.has(selectedCaptureDisplayId)
  ) {
    issues.push({
      id: 'missing-capture-display',
      severity: 'warning',
      summary: 'Screen capture display is unavailable. Pick another screen in Settings.',
      focusTarget: 'capture-display',
    });
  }

  if (
    selectedOverlayDisplayId !== PRIMARY_DISPLAY_ID &&
    !availableDisplayIds.has(selectedOverlayDisplayId)
  ) {
    issues.push({
      id: 'missing-overlay-display',
      severity: 'warning',
      summary:
        'Dock and panel display is unavailable. Livepair is using the primary display until you fix it.',
      focusTarget: 'overlay-display',
    });
  }

  return issues;
}

let deviceWatcherCleanup: (() => void) | null = null;
let deviceRefreshRequestId = 0;
let displayWatcherCleanup: (() => void) | null = null;
let displayRefreshRequestId = 0;

export type UiStoreState = {
  isPanelOpen: boolean;
  overlayWindowState: OverlayWindowState;
  panelView: PanelView;
  isDebugMode: boolean;
  backendUrlDraft: string;
  backendUrlError: string | null;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  displayOptions: readonly DesktopDisplayOption[];
  settingsIssues: readonly SettingsIssue[];
  settingsFocusTarget: SettingsFocusTarget | null;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  setOverlayWindowState: (overlayWindowState: OverlayWindowState) => void;
  setPanelView: (view: PanelView) => void;
  openSettingsForTarget: (target: SettingsFocusTarget) => void;
  clearSettingsFocusTarget: () => void;
  toggleDebugMode: () => void;
  initializeSettingsUi: (settings: { backendUrl: string }) => void;
  setBackendUrlDraft: (value: string) => void;
  setBackendUrlError: (value: string | null) => void;
  initializeDevicePreferences: () => Promise<void>;
  initializeDisplayPreferences: () => Promise<void>;
  refreshDisplayPreferences: () => Promise<void>;
  reset: () => void;
};

const defaultUiState = {
  isPanelOpen: false,
  overlayWindowState: {
    isFocused: false,
    isVisible: false,
    isInteractive: false,
  } as OverlayWindowState,
  panelView: 'chat' as PanelView,
  isDebugMode: false,
  backendUrlDraft: '',
  backendUrlError: null,
  inputDeviceOptions: [] as readonly SelectOptionItem[],
  outputDeviceOptions: [] as readonly SelectOptionItem[],
  displayOptions: [] as readonly DesktopDisplayOption[],
  settingsIssues: [] as readonly SettingsIssue[],
  settingsFocusTarget: null as SettingsFocusTarget | null,
};

export const useUiStore = create<UiStoreState>((set, get) => ({
  ...defaultUiState,
  togglePanel: () =>
    set((state) => ({
      isPanelOpen: !state.isPanelOpen,
      panelView: state.isPanelOpen ? 'chat' : state.panelView,
    })),
  openPanel: () =>
    set({
      isPanelOpen: true,
    }),
  closePanel: () =>
    set({
      isPanelOpen: false,
      panelView: 'chat',
      settingsFocusTarget: null,
    }),
  setOverlayWindowState: (overlayWindowState) => set({ overlayWindowState }),
  setPanelView: (panelView) => set({ panelView }),
  openSettingsForTarget: (settingsFocusTarget) =>
    set({
      isPanelOpen: true,
      panelView: 'settings',
      settingsFocusTarget,
    }),
  clearSettingsFocusTarget: () => set({ settingsFocusTarget: null }),
  toggleDebugMode: () => set((state) => ({ isDebugMode: !state.isDebugMode })),
  initializeSettingsUi: ({ backendUrl }) =>
    set((state) => ({
      backendUrlDraft: state.backendUrlDraft || backendUrl,
    })),
  setBackendUrlDraft: (backendUrlDraft) => set({ backendUrlDraft }),
  setBackendUrlError: (backendUrlError) => set({ backendUrlError }),
  initializeDevicePreferences: async () => {
    const applyDevices = async (): Promise<void> => {
      const requestId = ++deviceRefreshRequestId;
      const mediaDevices = navigator.mediaDevices;

      if (!mediaDevices?.enumerateDevices) {
        if (requestId === deviceRefreshRequestId) {
          set({
            inputDeviceOptions: UNAVAILABLE_INPUT_OPTION,
            outputDeviceOptions: UNAVAILABLE_OUTPUT_OPTION,
          });
        }
        return;
      }

      try {
        const devices = await mediaDevices.enumerateDevices();
        if (requestId !== deviceRefreshRequestId) {
          return;
        }

        const inputDeviceOptions = buildDeviceOptions(
          devices,
          'audioinput',
          UNAVAILABLE_INPUT_OPTION,
          'Microphone',
        );
        const outputDeviceOptions = buildDeviceOptions(
          devices,
          'audiooutput',
          UNAVAILABLE_OUTPUT_OPTION,
          'Speaker',
        );

        set({
          inputDeviceOptions,
          outputDeviceOptions,
        });

        const {
          selectedInputDeviceId,
          selectedOutputDeviceId,
        } = useSettingsStore.getState().settings;

        if (
          inputDeviceOptions[0]?.value !== 'unavailable' &&
          !inputDeviceOptions.some((option) => option.value === selectedInputDeviceId)
        ) {
          await useSettingsStore.getState().updateSettings({
            selectedInputDeviceId: DEFAULT_DEVICE_ID,
          });
          if (requestId !== deviceRefreshRequestId) {
            return;
          }
        }

        if (
          outputDeviceOptions[0]?.value !== 'unavailable' &&
          !outputDeviceOptions.some((option) => option.value === selectedOutputDeviceId)
        ) {
          await useSettingsStore.getState().updateSettings({
            selectedOutputDeviceId: DEFAULT_DEVICE_ID,
          });
        }
      } catch {
        if (requestId === deviceRefreshRequestId) {
          set({
            inputDeviceOptions: UNAVAILABLE_INPUT_OPTION,
            outputDeviceOptions: UNAVAILABLE_OUTPUT_OPTION,
          });
        }
      }
    };

    await applyDevices();

    if (deviceWatcherCleanup !== null) {
      return;
    }

    const handleDeviceChange = (): void => {
      void applyDevices();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    deviceWatcherCleanup = () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      deviceWatcherCleanup = null;
    };
  },
  refreshDisplayPreferences: async () => {
    const requestId = ++displayRefreshRequestId;

    try {
      const displayOptions = await window.bridge.listDisplays();
      if (requestId !== displayRefreshRequestId) {
        return;
      }

      set({
        displayOptions,
        settingsIssues: buildDisplayIssues(displayOptions),
      });
    } catch {
      if (requestId !== displayRefreshRequestId) {
        return;
      }

      set((state) => ({
        settingsIssues: buildDisplayIssues(state.displayOptions),
      }));
    }
  },
  initializeDisplayPreferences: async () => {
    await get().refreshDisplayPreferences();

    if (displayWatcherCleanup !== null) {
      return;
    }

    const handleWindowFocus = (): void => {
      void get().refreshDisplayPreferences();
    };

    window.addEventListener('focus', handleWindowFocus);
    displayWatcherCleanup = () => {
      window.removeEventListener('focus', handleWindowFocus);
      displayWatcherCleanup = null;
    };
  },
  reset: () => {
    deviceRefreshRequestId += 1;
    displayRefreshRequestId += 1;
    deviceWatcherCleanup?.();
    displayWatcherCleanup?.();
    set(defaultUiState);
  },
}));
