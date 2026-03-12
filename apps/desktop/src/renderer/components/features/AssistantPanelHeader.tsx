import { Bug, MessageCircle, Settings } from 'lucide-react';
import { type PanelView } from '../../store/uiStore';
import { PanelHeader } from '../layout';
import { Button, LivepairIcon } from '../primitives';

export type AssistantPanelHeaderProps = {
  panelView: PanelView;
  setPanelView: (view: PanelView) => void;
  showStateDevControls?: boolean;
};

function getButtonClassName(panelView: PanelView, targetView: PanelView): string | undefined {
  return panelView === targetView ? 'assistant-panel__header-btn--active' : undefined;
}

export function AssistantPanelHeader({
  panelView,
  setPanelView,
  showStateDevControls = false,
}: AssistantPanelHeaderProps): JSX.Element {
  return (
    <PanelHeader title="Livepair" icon={<LivepairIcon size={28} />}>
      {showStateDevControls ? (
        <Button
          variant="ghost"
          size="sm"
          raised
          onClick={() => setPanelView('debug')}
          aria-label="Developer tools"
          aria-pressed={panelView === 'debug'}
          className={getButtonClassName(panelView, 'debug')}
        >
          <Bug size={16} />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        raised
        onClick={() => setPanelView('settings')}
        aria-label="Settings"
        aria-pressed={panelView === 'settings'}
        className={getButtonClassName(panelView, 'settings')}
      >
        <Settings size={16} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        raised
        onClick={() => setPanelView('chat')}
        aria-label="Chat"
        aria-pressed={panelView === 'chat'}
        className={getButtonClassName(panelView, 'chat')}
      >
        <MessageCircle size={16} />
      </Button>
    </PanelHeader>
  );
}
