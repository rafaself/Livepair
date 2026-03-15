import { useEffect, useMemo } from 'react';
import type {
  ChatTimestampVisibility,
  DesktopVoice,
  PreferredMode,
  SpeechSilenceTimeout,
  ThemePreference,
  VisualSessionQuality,
} from '../../../../../shared';
import {
  DEFAULT_DESKTOP_SETTINGS,
  normalizeBackendBaseUrl,
} from '../../../../../shared';
import { useSettingsStore } from '../../../../store/settingsStore';
import { useSessionStore } from '../../../../store/sessionStore';
import { useUiStore } from '../../../../store/uiStore';
import type { SelectOptionItem } from '../../../primitives';

const UNAVAILABLE_INPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'Voice input unavailable in text-only release' },
];
const UNAVAILABLE_OUTPUT_OPTION: readonly SelectOptionItem[] = [
  { value: 'unavailable', label: 'Voice output unavailable in text-only release' },
];
const UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE = '';

export type AssistantPanelSettingsController = {
  isDebugMode: boolean;
  isPanelPinned: boolean;
  preferredMode: PreferredMode;
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  speechSilenceTimeout: SpeechSilenceTimeout;
  voiceEchoCancellationEnabled: boolean;
  voiceNoiseSuppressionEnabled: boolean;
  voiceAutoGainControlEnabled: boolean;
  themePreference: ThemePreference;
  visualSessionQuality: VisualSessionQuality;
  chatTimestampVisibility: ChatTimestampVisibility;
  voice: DesktopVoice;
  systemInstruction: string;
  inputDeviceOptions: readonly SelectOptionItem[];
  outputDeviceOptions: readonly SelectOptionItem[];
  screenCaptureSourceOptions: readonly SelectOptionItem[];
  backendUrlDraft: string;
  backendUrlError: string | null;
  selectedScreenCaptureSourceId: string;
  toggleDebugMode: () => void;
  togglePanelPinned: () => void;
  setPreferredMode: (mode: PreferredMode) => void;
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setSelectedScreenCaptureSourceId: (sourceId: string) => void;
  setSpeechSilenceTimeout: (timeout: SpeechSilenceTimeout) => void;
  setVoiceEchoCancellationEnabled: (enabled: boolean) => void;
  setVoiceNoiseSuppressionEnabled: (enabled: boolean) => void;
  setVoiceAutoGainControlEnabled: (enabled: boolean) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  setVisualSessionQuality: (quality: VisualSessionQuality) => void;
  setChatTimestampVisibility: (visibility: ChatTimestampVisibility) => void;
  setVoice: (voice: DesktopVoice) => void;
  setSystemInstruction: (systemInstruction: string) => void;
  restoreDefaultVoiceAndInstructions: () => void;
  handleBackendUrlChange: (value: string) => void;
  handleBackendUrlBlur: () => Promise<void>;
};

export function useAssistantPanelSettingsController(): AssistantPanelSettingsController {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const isDebugMode = useUiStore((state) => state.isDebugMode);
  const inputDeviceOptions = useUiStore((state) => state.inputDeviceOptions);
  const outputDeviceOptions = useUiStore((state) => state.outputDeviceOptions);
  const toggleDebugMode = useUiStore((state) => state.toggleDebugMode);
  const backendUrlDraft = useUiStore((state) => state.backendUrlDraft);
  const backendUrlError = useUiStore((state) => state.backendUrlError);
  const setBackendUrlDraft = useUiStore((state) => state.setBackendUrlDraft);
  const setBackendUrlError = useUiStore((state) => state.setBackendUrlError);
  const activeChatId = useSessionStore((state) => state.activeChatId);
  const screenCaptureSources = useSessionStore((state) => state.screenCaptureSources);
  const selectedScreenCaptureSourceId = useSessionStore(
    (state) => state.selectedScreenCaptureSourceId,
  );
  const setScreenCaptureSourceSnapshot = useSessionStore(
    (state) => state.setScreenCaptureSourceSnapshot,
  );
  const setLastRuntimeError = useSessionStore((state) => state.setLastRuntimeError);
  const resolvedBackendUrlDraft = backendUrlDraft || settings.backendUrl;
  const screenCaptureSourceOptions = useMemo(
    () =>
      screenCaptureSources.map((source) => ({
        value: source.id,
        label: source.name,
      })),
    [screenCaptureSources],
  );

  useEffect(() => {
    void window.bridge
      .listScreenCaptureSources()
      .then((snapshot) => {
        setScreenCaptureSourceSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        setLastRuntimeError(
          error instanceof Error && error.message.length > 0
            ? error.message
            : 'Failed to load screen capture sources',
        );
      });
  }, [activeChatId, setLastRuntimeError, setScreenCaptureSourceSnapshot]);

  const handleBackendUrlBlur = async (): Promise<void> => {
    const normalizedBackendUrl = normalizeBackendBaseUrl(resolvedBackendUrlDraft);

    if (!normalizedBackendUrl) {
      setBackendUrlError('Enter a valid http:// or https:// URL.');
      return;
    }

    try {
      const nextSettings = await updateSettings({
        backendUrl: normalizedBackendUrl,
      });

      setBackendUrlDraft(nextSettings.backendUrl);
      setBackendUrlError(null);
    } catch {
      setBackendUrlDraft(settings.backendUrl);
      setBackendUrlError('Unable to update backend URL.');
    }
  };

  const handleBackendUrlChange = (value: string): void => {
    setBackendUrlDraft(value);
    if (backendUrlError !== null) {
      setBackendUrlError(null);
    }
  };

  return {
    isDebugMode,
    isPanelPinned: settings.isPanelPinned,
    preferredMode: settings.preferredMode,
    selectedInputDeviceId: settings.selectedInputDeviceId,
    selectedOutputDeviceId: settings.selectedOutputDeviceId,
    speechSilenceTimeout: settings.speechSilenceTimeout,
    voiceEchoCancellationEnabled: settings.voiceEchoCancellationEnabled,
    voiceNoiseSuppressionEnabled: settings.voiceNoiseSuppressionEnabled,
    voiceAutoGainControlEnabled: settings.voiceAutoGainControlEnabled,
    themePreference: settings.themePreference,
    visualSessionQuality: settings.visualSessionQuality,
    chatTimestampVisibility: settings.chatTimestampVisibility,
    voice: settings.voice,
    systemInstruction: settings.systemInstruction,
    inputDeviceOptions:
      inputDeviceOptions.length > 0 ? inputDeviceOptions : UNAVAILABLE_INPUT_OPTION,
    outputDeviceOptions:
      outputDeviceOptions.length > 0 ? outputDeviceOptions : UNAVAILABLE_OUTPUT_OPTION,
    screenCaptureSourceOptions,
    backendUrlDraft: resolvedBackendUrlDraft,
    backendUrlError,
    selectedScreenCaptureSourceId:
      selectedScreenCaptureSourceId ?? UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE,
    toggleDebugMode,
    togglePanelPinned: () => {
      void updateSetting('isPanelPinned', !settings.isPanelPinned);
    },
    setPreferredMode: (preferredMode) => {
      void updateSetting('preferredMode', preferredMode);
    },
    setSelectedInputDeviceId: (selectedInputDeviceId) => {
      void updateSetting('selectedInputDeviceId', selectedInputDeviceId);
    },
    setSelectedOutputDeviceId: (selectedOutputDeviceId) => {
      void updateSetting('selectedOutputDeviceId', selectedOutputDeviceId);
    },
    setSelectedScreenCaptureSourceId: (sourceId) => {
      const nextSourceId =
        sourceId === UNSELECTED_SCREEN_CAPTURE_SOURCE_VALUE ? null : sourceId;

      void window.bridge
        .selectScreenCaptureSource(nextSourceId)
        .then((snapshot) => {
          setScreenCaptureSourceSnapshot(snapshot);
        })
        .catch((error: unknown) => {
          setLastRuntimeError(
            error instanceof Error && error.message.length > 0
              ? error.message
              : 'Failed to select screen capture source',
          );
        });
    },
    setSpeechSilenceTimeout: (speechSilenceTimeout) => {
      void updateSetting('speechSilenceTimeout', speechSilenceTimeout);
    },
    setVoiceEchoCancellationEnabled: (voiceEchoCancellationEnabled) => {
      void updateSetting('voiceEchoCancellationEnabled', voiceEchoCancellationEnabled);
    },
    setVoiceNoiseSuppressionEnabled: (voiceNoiseSuppressionEnabled) => {
      void updateSetting('voiceNoiseSuppressionEnabled', voiceNoiseSuppressionEnabled);
    },
    setVoiceAutoGainControlEnabled: (voiceAutoGainControlEnabled) => {
      void updateSetting('voiceAutoGainControlEnabled', voiceAutoGainControlEnabled);
    },
    setThemePreference: (themePreference) => {
      void updateSetting('themePreference', themePreference);
    },
    setVisualSessionQuality: (visualSessionQuality) => {
      void updateSetting('visualSessionQuality', visualSessionQuality);
    },
    setChatTimestampVisibility: (chatTimestampVisibility) => {
      void updateSetting('chatTimestampVisibility', chatTimestampVisibility);
    },
    setVoice: (voice) => {
      void updateSetting('voice', voice);
    },
    setSystemInstruction: (systemInstruction) => {
      void updateSetting('systemInstruction', systemInstruction);
    },
    restoreDefaultVoiceAndInstructions: () => {
      void updateSettings({
        voice: DEFAULT_DESKTOP_SETTINGS.voice,
        systemInstruction: DEFAULT_DESKTOP_SETTINGS.systemInstruction,
      });
    },
    handleBackendUrlChange,
    handleBackendUrlBlur,
  };
}
