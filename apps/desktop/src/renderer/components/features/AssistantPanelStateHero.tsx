import {
  AlertCircle,
  LoaderCircle,
  Mic,
  Sparkles,
  Unplug,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import {
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';

export type AssistantPanelStateHeroProps = {
  state: AssistantRuntimeState;
};

const HERO_COPY: Record<
  AssistantRuntimeState,
  {
    description: string;
    icon: LucideIcon;
  }
> = {
  disconnected: {
    description: 'The assistant is offline right now. Start talking to reconnect and begin a voice session.',
    icon: Unplug,
  },
  ready: {
    description: 'Everything is set. Start talking whenever you want help.',
    icon: Sparkles,
  },
  listening: {
    description: 'Livepair is listening. Speak naturally and keep going.',
    icon: Mic,
  },
  thinking: {
    description: 'Livepair is getting the conversation ready and preparing a response.',
    icon: LoaderCircle,
  },
  speaking: {
    description: 'Livepair is speaking now. You can interrupt whenever you need to.',
    icon: Volume2,
  },
  error: {
    description: 'Livepair could not start the session. Try again when you are ready.',
    icon: AlertCircle,
  },
};

export function AssistantPanelStateHero({
  state,
}: AssistantPanelStateHeroProps): JSX.Element {
  const label = ASSISTANT_RUNTIME_STATE_LABELS[state];
  const { description, icon: Icon } = HERO_COPY[state];

  return (
    <section
      className={`assistant-panel__hero assistant-panel__hero--${state}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={`assistant-panel__hero-visual assistant-panel__hero-visual--${state}`}>
        <Icon className={`assistant-panel__hero-icon assistant-panel__hero-icon--${state}`} size={28} />
        {state === 'speaking' ? (
          <span className="assistant-panel__hero-wave" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
      </div>
      <div className="assistant-panel__hero-copy">
        <h3 className="assistant-panel__hero-title">{label}</h3>
        <p className="assistant-panel__hero-description">{description}</p>
      </div>
    </section>
  );
}
