export type SpeechActivityIndicatorProps = {
  isActive?: boolean;
  className?: string;
};

export function SpeechActivityIndicator({
  isActive = false,
  className,
}: SpeechActivityIndicatorProps): JSX.Element {
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
      <span className="speech-activity-indicator__bar" />
      <span className="speech-activity-indicator__bar" />
      <span className="speech-activity-indicator__bar" />
    </span>
  );
}
