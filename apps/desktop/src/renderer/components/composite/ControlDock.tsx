import { useEffect, useState } from 'react';
import { ChevronLeft, Mic, MicOff, Monitor, MonitorOff, Phone, Play } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import './ControlDock.css';

export type ControlDockProps = {
  isSessionActive: boolean;
  onStartSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  isSessionActive,
  onStartSession,
  onEndSession,
}: ControlDockProps): JSX.Element {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const closePanel = useUiStore((state) => state.closePanel);
  const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);

  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());

  const shouldDimDock = !isPanelOpen && !isWindowFocused && !isHovered;

  useEffect(() => {
    const handleWindowFocus = (): void => {
      setIsWindowFocused(true);
    };

    const handleWindowBlur = (): void => {
      setIsWindowFocused(false);
      if (isPanelOpen && !isPanelPinned) {
        closePanel();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [closePanel, isPanelOpen, isPanelPinned]);

  return (
    <div
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
