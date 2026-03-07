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
    description: '',
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
      {state === 'ready' ? (
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="gemini-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1A73E8" />
              <stop offset="25%" stopColor="#5E5CE6" />
              <stop offset="50%" stopColor="#9334E6" />
              <stop offset="75%" stopColor="#E942B6" />
              <stop offset="100%" stopColor="#FF5F9E" />
            </linearGradient>
          </defs>
        </svg>
      ) : null}
      <div className={`assistant-panel__hero-visual assistant-panel__hero-visual--${state}`}>
        <Icon
          className={`assistant-panel__hero-icon assistant-panel__hero-icon--${state}`}
          size={22}
          stroke={state === 'ready' ? 'url(#gemini-gradient)' : undefined}
        />
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
        {description ? <p className="assistant-panel__hero-description">{description}</p> : null}
      </div>
    </section>
  );
}
