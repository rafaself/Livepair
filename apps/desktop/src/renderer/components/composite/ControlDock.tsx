import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type {
  ControlGatingSnapshot,
  ScreenCaptureState,
  SpeechLifecycleStatus,
  VoiceCaptureState,
} from '../../runtime/liveRuntime';
import { ControlDockSpeechControls } from './ControlDockSpeechControls';
import { createControlDockUiState } from './controlDockUiState';
import { useControlDockVisibility } from './useControlDockVisibility';
import './ControlDock.css';

export type ControlDockProps = {
  controlGatingSnapshot: ControlGatingSnapshot;
  speechLifecycleStatus: SpeechLifecycleStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onSendScreenNow: () => void;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  controlGatingSnapshot,
  speechLifecycleStatus,
  voiceCaptureState,
  screenCaptureState,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onStartScreenCapture,
  onStopScreenCapture,
  onSendScreenNow,
  onEndSession,
}: ControlDockProps): JSX.Element {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const closePanel = useUiStore((state) => state.closePanel);
  const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);
  const screenContextMode = useSettingsStore((state) => state.settings.screenContextMode);
  const { isHovered, isWindowFocused, onMouseEnter, onMouseLeave } = useControlDockVisibility({
    closePanel,
    isPanelOpen,
    isPanelPinned,
  });
  const shouldDimDock = !isPanelOpen && !isWindowFocused && !isHovered;
  const uiState = createControlDockUiState({
    controlGatingSnapshot,
    speechLifecycleStatus,
    voiceCaptureState,
    screenCaptureState,
    screenContextMode,
    isPanelOpen,
  });

  return (
    <div
      className={`control-dock${isPanelOpen ? ' control-dock--panel-open' : ''}${shouldDimDock ? ' control-dock--dimmed' : ''}`}
      role="toolbar"
      aria-label="Assistant controls"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ControlDockSpeechControls
        onEndSession={onEndSession}
        onStartScreenCapture={onStartScreenCapture}
        onStartVoiceCapture={onStartVoiceCapture}
        onStopScreenCapture={onStopScreenCapture}
        onStopVoiceCapture={onStopVoiceCapture}
        onSendScreenNow={onSendScreenNow}
        uiState={uiState}
      />

      <div className="control-dock__item-wrapper control-dock__item-wrapper--visible">
        <div className="control-dock__item-content">
          <IconButton
            label={isPanelOpen ? 'Close panel' : 'Open panel'}
            className={`control-dock__panel-btn${isPanelOpen ? ' control-dock__btn--active' : ''}`}
            aria-controls="assistant-panel"
            aria-expanded={isPanelOpen}
            onClick={togglePanel}
          >
            <ChevronLeft size={18} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
