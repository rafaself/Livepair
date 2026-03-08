import { useEffect, useState } from 'react';
import { ChevronLeft, Mic, MicOff, Monitor, MonitorOff, Phone, Play } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import './ControlDock.css';

export type ControlDockProps = Record<string, never>;

export function ControlDock(_props: ControlDockProps): JSX.Element {
  const {
    state: { isPanelOpen, isPanelPinned, assistantState },
    togglePanel,
    closePanel,
    setAssistantState,
  } = useUiStore();

  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());

  const isSessionActive = assistantState !== 'disconnected';
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
        onClick={() => setAssistantState(isSessionActive ? 'disconnected' : 'listening')}
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
