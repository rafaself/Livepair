import { checkBackendHealth, requestSessionToken } from '../api/backend';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { defaultRuntimeLogger } from './core/logger';
import { createGeminiLiveTransport } from './transport/geminiLiveTransport';
import { visualSessionQualityToMediaResolution } from './transport/visualSessionQuality';
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
    createTransport: (_kind) => createGeminiLiveTransport({
      mediaResolutionOverride: visualSessionQualityToMediaResolution(
        useSettingsStore.getState().settings.visualSessionQuality,
      ),
    }),
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
