import { useUiStore } from '../../store/uiStore';
import './Launcher.css';

export type LauncherProps = Record<string, never>;

export function Launcher(_props: LauncherProps): JSX.Element {
  const {
    state: { isPanelOpen },
    togglePanel,
  } = useUiStore();

  return (
    <button
      type="button"
      className={`launcher ${isPanelOpen ? 'launcher--open' : ''}`}
      aria-label={isPanelOpen ? 'Close assistant panel' : 'Open assistant panel'}
      aria-controls="assistant-panel"
      aria-expanded={isPanelOpen}
      onClick={togglePanel}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="launcher__icon"
      >
        <polyline points={isPanelOpen ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
      </svg>
    </button>
  );
}
