import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UiStoreProvider, useUiStore } from './uiStore';

function UiStoreHarness(): JSX.Element {
  const {
    state,
    togglePanel,
    closePanel,
    openSettings,
    closeSettings,
    setAssistantState,
  } = useUiStore();

  return (
    <div>
      <output aria-label="panel-open">{String(state.isPanelOpen)}</output>
      <output aria-label="settings-open">{String(state.isSettingsOpen)}</output>
      <output aria-label="assistant-state">{state.assistantState}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={closePanel}>
        close panel
      </button>
      <button type="button" onClick={openSettings}>
        open settings
      </button>
      <button type="button" onClick={closeSettings}>
        close settings
      </button>
      <button type="button" onClick={() => setAssistantState('speaking')}>
        set speaking
      </button>
    </div>
  );
}

describe('uiStore', () => {
  it('applies panel, settings, and assistant state actions with closePanel closing settings', () => {
    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(screen.getByLabelText('settings-open')).toHaveTextContent('false');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'open settings' }));
    expect(screen.getByLabelText('settings-open')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'set speaking' }));
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('speaking');

    fireEvent.click(screen.getByRole('button', { name: 'close panel' }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(screen.getByLabelText('settings-open')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'close settings' }));
    expect(screen.getByLabelText('settings-open')).toHaveTextContent('false');
  });
});
