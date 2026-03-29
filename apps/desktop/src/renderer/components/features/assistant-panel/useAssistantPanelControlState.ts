import {
  type LiveRuntimeSessionSnapshot,
} from '../../../runtime/liveRuntime';

type UseAssistantPanelControlStateOptions = {
  sessionSnapshot: Pick<
    LiveRuntimeSessionSnapshot,
    'composerSpeechActionKind' | 'controlGatingSnapshot'
  >;
};

export type AssistantPanelControlState = {
  controlGatingSnapshot: LiveRuntimeSessionSnapshot['controlGatingSnapshot'];
  composerSpeechActionKind: LiveRuntimeSessionSnapshot['composerSpeechActionKind'];
};

export function useAssistantPanelControlState({
  sessionSnapshot,
}: UseAssistantPanelControlStateOptions): AssistantPanelControlState {
  return {
    controlGatingSnapshot: sessionSnapshot.controlGatingSnapshot,
    composerSpeechActionKind: sessionSnapshot.composerSpeechActionKind,
  };
}
