import { checkBackendHealth, reportLiveTelemetry, requestSessionToken } from '../api/backend';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { resolveActiveScreenContextQuality } from '../../shared';
import { defaultRuntimeLogger } from './core/logger';
import { createGeminiLiveTransport } from './transport/geminiLiveTransport';
import { continuousScreenQualityToMediaResolution } from './transport/continuousScreenQuality';
import { createAssistantAudioPlayback } from './audio/assistantAudioPlayback';
import { createLocalVoiceCapture } from './audio/localVoiceCapture';
import { createLocalScreenCapture } from './screen/localScreenCapture';
import { createSessionControllerAssembly } from './session/sessionControllerAssembly';
import type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './core/sessionControllerTypes';

export type {
  DesktopSessionController,
  DesktopSessionControllerDependencies,
} from './core/sessionControllerTypes';

function resolveDesktopSessionControllerDependencies(
  overrides: Partial<DesktopSessionControllerDependencies>,
): DesktopSessionControllerDependencies {
  return {
    logger: defaultRuntimeLogger,
    checkBackendHealth,
    requestSessionToken,
    reportLiveTelemetry,
    createTransport: (_kind, options) => {
      const settings = useSettingsStore.getState().settings;

      return createGeminiLiveTransport({
        mediaResolutionOverride: continuousScreenQualityToMediaResolution(
          resolveActiveScreenContextQuality(settings),
        ),
        groundingEnabled: settings.groundingEnabled,
        voice: options?.voice ?? settings.voice,
        systemInstruction: settings.systemInstruction,
      });
    },
    createVoiceCapture: (observer) => createLocalVoiceCapture(observer),
    createVoicePlayback: (observer, options) =>
      createAssistantAudioPlayback(observer, options),
    createScreenCapture: (observer) => createLocalScreenCapture(observer, {
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

export function createDesktopSessionController(
  overrides: Partial<DesktopSessionControllerDependencies> = {},
): DesktopSessionController {
  return createSessionControllerAssembly(
    resolveDesktopSessionControllerDependencies(overrides),
  );
}

let desktopSessionController: DesktopSessionController | null = null;

export function getDesktopSessionController(): DesktopSessionController {
  if (!desktopSessionController) {
    desktopSessionController = createDesktopSessionController();
  }

  return desktopSessionController;
}

export function resetDesktopSessionController(): void {
  desktopSessionController = null;
}
