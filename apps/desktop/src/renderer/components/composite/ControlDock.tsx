import { useState, type Ref } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Phone,
  Play,
} from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import './ControlDock.css';

export type ControlDockProps = {
  dockRef?: Ref<HTMLDivElement> | undefined;
  isSessionActive: boolean;
  onStartSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  dockRef,
  isSessionActive,
  onStartSession,
  onEndSession,
}: ControlDockProps): JSX.Element {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const isOverlayFocused = useUiStore((state) => state.overlayWindowState.isFocused);
  const settingsIssues = useUiStore((state) => state.settingsIssues);
  const openSettingsForTarget = useUiStore((state) => state.openSettingsForTarget);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const primarySettingsIssue = settingsIssues[0] ?? null;

  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const shouldDimDock = !isOverlayFocused && !isHovered;

  return (
    <div
      ref={dockRef}
      className={`control-dock${isPanelOpen ? ' control-dock--panel-open' : ''}${shouldDimDock ? ' control-dock--dimmed' : ''}`}
      role="toolbar"
      aria-label="Assistant controls"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <IconButton
        label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
        className={isMicActive ? 'control-dock__btn--active' : undefined}
        onClick={() => setIsMicActive((prev) => !prev)}
      >
        {isMicActive ? <Mic size={18} /> : <MicOff size={18} />}
      </IconButton>

      <IconButton
        label={isCameraActive ? 'Disable camera' : 'Enable camera'}
        className={isCameraActive ? 'control-dock__btn--active' : undefined}
        onClick={() => setIsCameraActive((prev) => !prev)}
      >
        {isCameraActive ? <Monitor size={18} /> : <MonitorOff size={18} />}
      </IconButton>

      <IconButton
        label={isSessionActive ? 'End session' : 'Start session'}
        className={isSessionActive ? 'control-dock__btn--danger' : 'control-dock__btn--start'}
        onClick={() => void (isSessionActive ? onEndSession() : onStartSession())}
      >
        {isSessionActive ? <Phone size={18} /> : <Play size={18} />}
      </IconButton>

      {primarySettingsIssue ? (
        <IconButton
          label="Open warnings"
          className="control-dock__btn--warning"
          onClick={() => openSettingsForTarget(primarySettingsIssue.focusTarget)}
        >
          <AlertTriangle size={18} />
        </IconButton>
      ) : null}

      <Divider orientation="horizontal" />

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
  );
}
