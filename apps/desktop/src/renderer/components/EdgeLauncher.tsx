type EdgeLauncherProps = {
  isPanelOpen: boolean;
  onToggle: () => void;
};

export function EdgeLauncher({
  isPanelOpen,
  onToggle,
}: EdgeLauncherProps): JSX.Element {
  return (
    <button
      type="button"
      className={`edge-launcher ${isPanelOpen ? 'edge-launcher--open' : ''}`}
      aria-label={isPanelOpen ? 'Close assistant panel' : 'Open assistant panel'}
      aria-controls="assistant-panel"
      aria-expanded={isPanelOpen}
      onClick={onToggle}
    >
      <span className="edge-launcher__core" />
    </button>
  );
}
