import { checkBackendHealth, reportLiveTelemetry, requestSessionToken } from '../../api/backend';
import { useCaptureExclusionRectsStore } from '../../store/captureExclusionRectsStore';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { resolveActiveScreenContextQuality } from '../../../shared';
import { configureRuntimeLogging, defaultRuntimeLogger } from '../core/logger';
import { configureRuntimeDebugMode } from '../core/debugMode';
import { createGeminiLiveTransportAdapter } from '../transport/geminiLiveTransport';
import { continuousScreenQualityToMediaResolution } from '../transport/continuousScreenQuality';
import { configureLiveConfigEnv, LIVE_ADAPTER_KEY, type LiveConfigEnv } from '../transport/liveConfig';
import { createAssistantAudioPlayback } from '../audio/assistantAudioPlayback';
import { createLocalVoiceCapture } from '../audio/localVoiceCapture';
import { createLocalScreenCapture } from '../screen/localScreenCapture';
import type { DesktopSessionControllerDependencies } from '../core/sessionControllerTypes';
import desktopPackageJson from '../../../../package.json';
import { searchProjectKnowledge } from '../../api/backend';

function resolveRuntimePlatform(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string | undefined } | undefined;
  };

  if (typeof navigatorWithUserAgentData.userAgentData?.platform === 'string') {
    return navigatorWithUserAgentData.userAgentData.platform;
  }

  return navigator.platform || 'unknown';
}

export function createDesktopSessionControllerDependencies(
  overrides: Partial<DesktopSessionControllerDependencies>,
): DesktopSessionControllerDependencies {
  configureRuntimeLogging({
    isConsoleLoggingEnabled: () =>
      import.meta.env.DEV || import.meta.env.MODE === 'test' || useUiStore.getState().isDebugMode,
    isVerboseLoggingEnabled: () =>
      import.meta.env.MODE === 'test' || useUiStore.getState().isDebugMode,
    defaultConsoleLoggingEnabled: import.meta.env.DEV || import.meta.env.MODE === 'test',
  });
  configureRuntimeDebugMode(() => useUiStore.getState().isDebugMode);
  configureLiveConfigEnv(import.meta.env as LiveConfigEnv);

  const transportAdapter = overrides.transportAdapter
    ?? (
      overrides.createTransport
        ? {
            key: LIVE_ADAPTER_KEY,
            create: (options) => overrides.createTransport!(LIVE_ADAPTER_KEY, options),
          }
        : createGeminiLiveTransportAdapter(() => {
            const settings = useSettingsStore.getState().settings;

            return {
              mediaResolutionOverride: continuousScreenQualityToMediaResolution(
                resolveActiveScreenContextQuality(settings),
              ),
              groundingEnabled: settings.groundingEnabled,
              voice: settings.voice,
              systemInstruction: settings.systemInstruction,
            };
          })
    );

  return {
    logger: defaultRuntimeLogger,
    checkBackendHealth,
    requestSessionToken,
    reportLiveTelemetry,
    searchProjectKnowledge,
    screenSourceAdapter: {
      listScreenCaptureSources: () => window.bridge.listScreenCaptureSources(),
      selectScreenCaptureSource: (sourceId) =>
        window.bridge.selectScreenCaptureSource(sourceId),
    },
    screenFrameDumpAdapter: {
      shouldSaveFrames: () => useUiStore.getState().saveScreenFramesEnabled,
      startScreenFrameDumpSession: () => window.bridge.startScreenFrameDumpSession(),
      saveScreenFrameDumpFrame: (request) => window.bridge.saveScreenFrameDumpFrame(request),
      setScreenFrameDumpDirectoryPath: (directoryPath) => {
        useUiStore.getState().setScreenFrameDumpDirectoryPath(directoryPath);
      },
    },
    runtimeEnvironment: {
      environment: import.meta.env.MODE,
      platform: resolveRuntimePlatform(),
      appVersion: desktopPackageJson.version,
    },
    transportAdapter,
    createVoiceCapture: (observer) => createLocalVoiceCapture(observer, {
      mediaDevices: navigator.mediaDevices,
    }),
    createVoicePlayback: (observer, options) =>
      createAssistantAudioPlayback(observer, options),
    createScreenCapture: (observer) => createLocalScreenCapture(observer, {
      getDisplayMedia: () => navigator.mediaDevices.getDisplayMedia({ video: true }),
      getScreenCaptureAccessStatus: () => window.bridge.getScreenCaptureAccessStatus(),
      getCaptureExclusionMaskingContext: () => {
        const sessionState = useSessionStore.getState();
        const selectedSource = sessionState.selectedScreenCaptureSourceId === null
          ? null
          : sessionState.screenCaptureSources.find(
              (source) => source.id === sessionState.selectedScreenCaptureSourceId,
            ) ?? null;

        return {
          exclusionRects: useCaptureExclusionRectsStore.getState().rects,
          overlayVisibility: useCaptureExclusionRectsStore.getState().overlayVisibility,
          overlayDisplay: sessionState.overlayDisplay,
          selectedSource,
        };
      },
    }),
    store: useSessionStore,
    settingsStore: useSettingsStore,
    ...overrides,
  };
}
