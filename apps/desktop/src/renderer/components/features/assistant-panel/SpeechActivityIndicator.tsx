import { useEffect, useRef } from 'react';
import { micLevelChannel } from '../../../runtime/audio/micLevelChannel';

export type SpeechActivityIndicatorProps = {
  isActive?: boolean;
  className?: string;
};

const BAR_COUNT = 3;
const BAR_MIN_PX = 5;
const BAR_MAX_PX = 14;
const LEVEL_FLOOR = 0.004;
const LEVEL_CEILING = 0.12;
const ATTACK = 0.55;
const RELEASE = 0.18;
const BAR_WEIGHTS = [0.85, 1, 0.9];

function normalizeLevel(rms: number): number {
  if (rms <= LEVEL_FLOOR) return 0;
  const clamped = Math.min(rms, LEVEL_CEILING);
  return (clamped - LEVEL_FLOOR) / (LEVEL_CEILING - LEVEL_FLOOR);
}

export function SpeechActivityIndicator({
  isActive = false,
  className,
}: SpeechActivityIndicatorProps): JSX.Element {
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const smoothedRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = (): void => {
      const target = targetRef.current;
      const smoothed = smoothedRef.current;
      const coeff = target > smoothed ? ATTACK : RELEASE;
      const next = smoothed + (target - smoothed) * coeff;
      smoothedRef.current = next;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barRefs.current[i];
        if (!bar) continue;
        const weight = BAR_WEIGHTS[i] ?? 1;
        const weighted = Math.min(1, next * weight);
        const height = BAR_MIN_PX + (BAR_MAX_PX - BAR_MIN_PX) * weighted;
        bar.style.height = `${height.toFixed(2)}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const unsubscribe = micLevelChannel.subscribe((level) => {
      targetRef.current = normalizeLevel(level);
    });

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      unsubscribe();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <span
      className={[
        'speech-activity-indicator',
        isActive && 'speech-activity-indicator--active',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: BAR_COUNT }).map((_, index) => (
        <span
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          ref={(el) => {
            barRefs.current[index] = el;
          }}
          className="speech-activity-indicator__bar"
        />
      ))}
    </span>
  );
}
