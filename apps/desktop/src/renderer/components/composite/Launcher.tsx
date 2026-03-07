import './Launcher.css';

export type LauncherProps = {
  isPanelOpen: boolean;
  onToggle: () => void;
};

export function Launcher({
  isPanelOpen,
  onToggle,
}: LauncherProps): JSX.Element {
  return (
    <button
      type="button"
      className={`launcher ${isPanelOpen ? 'launcher--open' : ''}`}
      aria-label={isPanelOpen ? 'Close assistant panel' : 'Open assistant panel'}
      aria-controls="assistant-panel"
      aria-expanded={isPanelOpen}
      onClick={onToggle}
    >
      <span className="launcher__core" />
    </button>
  );
}
