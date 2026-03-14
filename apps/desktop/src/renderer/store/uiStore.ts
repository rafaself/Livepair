import { create } from 'zustand';
import type { SelectOptionItem } from '../components/primitives';
import { useSettingsStore } from './settingsStore';

export type PanelView = 'chat' | 'history' | 'settings' | 'debug';
const DEFAULT_DEVICE_ID = 'default';
const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No microphone detected' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'No speaker detected' },
];

// Matches "HDMI Output 1", "HDMI 2", "DisplayPort Output 3", etc.
// Requires a trailing number so a bare "HDMI" label is never collapsed.
const REDUNDANT_VARIANT_PATTERN = /^(HDMI|DisplayPort)(?: Output)? \d+$/i;

/**
 * Returns true and records the base name when the label is a redundant numbered
 * HDMI / DisplayPort variant that has already been seen (i.e. should be collapsed).
 * Returns false when the label is the first of its family or does not match.
 */
function isRedundantNumberedVariant(label: string, seen: Set<string>): boolean {
  if (!REDUNDANT_VARIANT_PATTERN.test(label)) {
    return false;
  }
  const baseName = label.replace(/\s*\d+$/, '').trim();
  if (seen.has(baseName)) {
    return true;
  }
  seen.add(baseName);
  return false;
}

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
  const seenRedundantBases = new Set<string>();

  return [
    { value: DEFAULT_DEVICE_ID, label: 'System default' },
    ...matchingDevices.flatMap((device) => {
      if (device.deviceId === DEFAULT_DEVICE_ID) {
        return [];
      }

      const label = device.label || `${unnamedLabelPrefix} ${++unnamedDeviceCount}`;

      if (kind === 'audiooutput' && isRedundantNumberedVariant(label, seenRedundantBases)) {
        return [];
      }

      return [{ value: device.deviceId, label }];
    }),
  ];
}

let deviceWatcherCleanup: (() => void) | null = null;
let deviceRefreshRequestId = 0;

type UiStoreState = {
  isPanelOpen: boolean;
  panelView: PanelView;
  isDebugMode: boolean;
  isComposerMicrophoneEnabled: boolean;
  saveScreenFramesEnabled: boolean;
  screenFrameDumpDirectoryPath: string | null;
  backendUrlDraft: string;
  backendUrlError: string | null;
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
  initializeSettingsUi: (settings: { backendUrl: string }) => void;
  setBackendUrlDraft: (value: string) => void;
  setBackendUrlError: (value: string | null) => void;
  initializeDevicePreferences: () => Promise<void>;
  reset: () => void;
};

const defaultUiState = {
  isPanelOpen: false,
  panelView: 'chat' as PanelView,
  isDebugMode: false,
  isComposerMicrophoneEnabled: true,
  saveScreenFramesEnabled: false,
  screenFrameDumpDirectoryPath: null,
  backendUrlDraft: '',
  backendUrlError: null,
  inputDeviceOptions: [] as readonly SelectOptionItem[],
  outputDeviceOptions: [] as readonly SelectOptionItem[],
};

export const useUiStore = create<UiStoreState>((set) => ({
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

    const subscribedMediaDevices = navigator.mediaDevices;
    subscribedMediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    deviceWatcherCleanup = () => {
      subscribedMediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      deviceWatcherCleanup = null;
    };
  },
  reset: () => {
    deviceRefreshRequestId += 1;
    deviceWatcherCleanup?.();
    set(defaultUiState);
  },
}));
