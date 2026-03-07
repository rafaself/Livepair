import { useState } from 'react';
import { Mic, MicOff, PhoneOff, Settings, Video, VideoOff } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import './ControlDock.css';

export type ControlDockProps = Record<string, never>;

export function ControlDock(_props: ControlDockProps): JSX.Element {
  const {
    state: { isPanelOpen, assistantState },
    togglePanel,
    setAssistantState,
  } = useUiStore();

  const [isMicActive, setIsMicActive] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const isSessionActive = assistantState !== 'disconnected';

  return (
    <div
      className={`control-dock${isPanelOpen ? ' control-dock--panel-open' : ''}`}
      role="toolbar"
      aria-label="Assistant controls"
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
        {isCameraActive ? <Video size={18} /> : <VideoOff size={18} />}
      </IconButton>

      <IconButton
        label="End session"
        className="control-dock__btn--danger"
        disabled={!isSessionActive}
        onClick={() => setAssistantState('disconnected')}
      >
        <PhoneOff size={18} />
      </IconButton>

      <Divider orientation="horizontal" />

      <IconButton
        label={isPanelOpen ? 'Close panel' : 'Open panel'}
        className={isPanelOpen ? 'control-dock__btn--active' : undefined}
        aria-controls="assistant-panel"
        aria-expanded={isPanelOpen}
        onClick={togglePanel}
      >
        <Settings size={18} />
      </IconButton>
    </div>
  );
}
