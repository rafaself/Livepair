import { create } from 'zustand';
import type { SelectOptionItem } from '../components/primitives';
import { useSettingsStore } from './settingsStore';

export type PanelView = 'chat' | 'history' | 'settings' | 'preferences' | 'debug';
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

function deviceOptionsMatch(
  a: readonly SelectOptionItem[],
  b: readonly SelectOptionItem[],
): boolean {
  return (
    a.length === b.length
    && a.every((opt, i) => opt.value === b[i]?.value && opt.label === b[i]?.label)
  );
}

let deviceWatcherCleanup: (() => void) | null = null;
let deviceRefreshRequestId = 0;
let pendingDeviceRefreshTimeouts: number[] = [];

function clearPendingDeviceRefreshTimeouts(): void {
  pendingDeviceRefreshTimeouts.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  pendingDeviceRefreshTimeouts = [];
}

type UiStoreState = {
  isPanelOpen: boolean;
  panelView: PanelView;
  isDebugMode: boolean;
  isComposerMicrophoneEnabled: boolean;
  saveScreenFramesEnabled: boolean;
  screenFrameDumpDirectoryPath: string | null;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  togglePanel: () => void;
  closePanel: () => void;
  setPanelView: (view: PanelView) => void;
  toggleDebugMode: () => void;
  toggleComposerMicrophoneEnabled: () => void;
  setComposerMicrophoneEnabled: (enabled: boolean) => void;
  setSaveScreenFramesEnabled: (enabled: boolean) => void;
  setScreenFrameDumpDirectoryPath: (directoryPath: string | null) => void;
  refreshDevices: () => Promise<void>;
  initializeDevicePreferences: () => Promise<void>;
  reset: () => void;
};

const defaultUiState = {
  isPanelOpen: true,
  panelView: 'chat' as PanelView,
  isDebugMode: false,
  isComposerMicrophoneEnabled: true,
  saveScreenFramesEnabled: false,
  screenFrameDumpDirectoryPath: null,
  inputDeviceOptions: [] as readonly SelectOptionItem[],
  outputDeviceOptions: [] as readonly SelectOptionItem[],
};

export const useUiStore = create<UiStoreState>((set, get) => {
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

      // Skip the store update when nothing changed to avoid unnecessary re-renders.
      const current = get();
      const inputChanged = !deviceOptionsMatch(current.inputDeviceOptions, inputDeviceOptions);
      const outputChanged = !deviceOptionsMatch(current.outputDeviceOptions, outputDeviceOptions);
      if (!inputChanged && !outputChanged) {
        return;
      }

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

  return {
    ...defaultUiState,
    togglePanel: () =>
      set((state) => ({
        isPanelOpen: !state.isPanelOpen,
        panelView: state.isPanelOpen ? 'chat' : state.panelView,
      })),
    closePanel: () =>
      set({
        isPanelOpen: false,
        panelView: 'chat',
      }),
    setPanelView: (panelView) => set({ panelView }),
    toggleDebugMode: () =>
      set((state) => ({
        isDebugMode: !state.isDebugMode,
        panelView: !state.isDebugMode
          ? state.panelView
          : state.panelView === 'debug'
            ? 'chat'
            : state.panelView,
        saveScreenFramesEnabled: state.isDebugMode ? false : state.saveScreenFramesEnabled,
        screenFrameDumpDirectoryPath: state.isDebugMode ? null : state.screenFrameDumpDirectoryPath,
      })),
    toggleComposerMicrophoneEnabled: () =>
      set((state) => ({
        isComposerMicrophoneEnabled: !state.isComposerMicrophoneEnabled,
      })),
    setComposerMicrophoneEnabled: (isComposerMicrophoneEnabled) => set({ isComposerMicrophoneEnabled }),
    setSaveScreenFramesEnabled: (saveScreenFramesEnabled) => set({ saveScreenFramesEnabled }),
    setScreenFrameDumpDirectoryPath: (screenFrameDumpDirectoryPath) =>
      set({ screenFrameDumpDirectoryPath }),
    refreshDevices: () => applyDevices(),
    initializeDevicePreferences: async () => {
      // Chromium only includes audiooutput entries in enumerateDevices after
      // microphone permission has been granted. Probe once and release immediately
      // so that output devices (e.g. HDMI) are visible before any session starts.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        // Permission denied or unavailable – enumerate anyway; output devices
        // may still be partially visible via the system default.
      }

      await applyDevices();

      if (deviceWatcherCleanup !== null) {
        return;
      }

      const handleDeviceChange = (): void => {
        void applyDevices();
        // On Linux (PulseAudio/PipeWire) the audio daemon may not finish
        // registering a reconnected device before devicechange fires.
        // Retry a few times with increasing delays to catch late-appearing devices.
        clearPendingDeviceRefreshTimeouts();
        for (const delay of [500, 1500, 3000]) {
          const timeoutId = window.setTimeout(() => {
            pendingDeviceRefreshTimeouts = pendingDeviceRefreshTimeouts.filter(
              (scheduledTimeoutId) => scheduledTimeoutId !== timeoutId,
            );
            void applyDevices();
          }, delay);
          pendingDeviceRefreshTimeouts.push(timeoutId);
        }
      };

      const subscribedMediaDevices = navigator.mediaDevices;
      subscribedMediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

      deviceWatcherCleanup = () => {
        subscribedMediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
        deviceWatcherCleanup = null;
      };
    },
    reset: () => {
      deviceRefreshRequestId += 1;
      clearPendingDeviceRefreshTimeouts();
      deviceWatcherCleanup?.();
      set(defaultUiState);
    },
  };
});
