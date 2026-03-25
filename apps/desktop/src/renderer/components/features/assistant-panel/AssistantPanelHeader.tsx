import { Bug, MessageCircle, Settings, Settings2, X } from 'lucide-react';
import { type PanelView } from '../../../store/uiStore';
import { PanelHeader } from '../../layout';
import { Button, LivepairIcon } from '../../primitives';
import { SpeechActivityIndicator } from './SpeechActivityIndicator';
import type { SpeechLifecycleStatus } from '../../../runtime';

export type AssistantPanelHeaderProps = {
  panelView: PanelView;
  setPanelView: (view: PanelView) => void;
  isDebugMode?: boolean;
  localUserSpeechActive?: boolean;
  speechLifecycleStatus?: SpeechLifecycleStatus;
};

function getButtonClassName(panelView: PanelView, targetView: PanelView): string | undefined {
  return panelView === targetView ? 'assistant-panel__header-btn--active' : undefined;
}

function isChatSectionActive(panelView: PanelView): boolean {
  return panelView === 'chat' || panelView === 'history';
}

export function AssistantPanelHeader({
  panelView,
  setPanelView,
  isDebugMode = false,
  localUserSpeechActive = false,
  speechLifecycleStatus = 'off',
}: AssistantPanelHeaderProps): JSX.Element {
  const isSpeechActive = localUserSpeechActive || speechLifecycleStatus === 'userSpeaking';
  return (
    <PanelHeader title="Livepair" icon={<LivepairIcon size={28} />}>
      {isDebugMode ? (
        <Button
          variant="ghost"
          size="sm"
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
        onClick={() => setPanelView('preferences')}
        aria-label="Preferences"
        aria-pressed={panelView === 'preferences'}
        className={getButtonClassName(panelView, 'preferences')}
      >
        <Settings2 size={16} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPanelView('chat')}
        aria-label="Chat"
        aria-pressed={isChatSectionActive(panelView)}
        className={isChatSectionActive(panelView) ? 'assistant-panel__header-btn--active' : undefined}
      >
        {isSpeechActive ? (
          <SpeechActivityIndicator
            isActive={true}
            className="assistant-panel__header-speech-indicator"
          />
        ) : (
          <MessageCircle size={16} />
        )}
      </Button>
      <span className="panel-header__actions-divider" aria-hidden="true" />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void window.bridge.quitApp()}
        aria-label="Quit application"
      >
        <X size={16} />
      </Button>
    </PanelHeader>
  );
}
