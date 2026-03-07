import {
  AlertCircle,
  AudioLines,
  LoaderCircle,
  Mic,
  Sparkles,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import {
  ASSISTANT_RUNTIME_STATE_LABELS,
  type AssistantRuntimeState,
} from '../../state/assistantUiState';

export type AssistantPanelStateHeroProps = {
  state: AssistantRuntimeState;
};

const HERO_COPY: Record<AssistantRuntimeState, LucideIcon> = {
  disconnected: Unplug,
  ready: Sparkles,
  listening: Mic,
  thinking: LoaderCircle,
  speaking: AudioLines,
  error: AlertCircle,
};

export function AssistantPanelStateHero({
  state,
}: AssistantPanelStateHeroProps): JSX.Element {
  const label = ASSISTANT_RUNTIME_STATE_LABELS[state];
  const Icon = HERO_COPY[state];

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
          {...(state === 'ready' ? { stroke: 'url(#gemini-gradient)' } : {})}
        />
      </div>
      <div className="assistant-panel__hero-copy">
        <h3 className="assistant-panel__hero-title">{label}</h3>
      </div>
    </section>
  );
}
