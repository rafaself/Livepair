import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { UiStoreProvider, useUiStore } from './uiStore';

function UiStoreHarness(): JSX.Element {
  const {
    state,
    togglePanel,
    closePanel,
    setPanelView,
    setAssistantState,
    setSelectedInputDeviceId,
  } = useUiStore();

  return (
    <div>
      <output aria-label="panel-open">{String(state.isPanelOpen)}</output>
      <output aria-label="panel-view">{state.panelView}</output>
      <output aria-label="assistant-state">{state.assistantState}</output>
      <output aria-label="selected-input-device">{state.selectedInputDeviceId}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={closePanel}>
        close panel
      </button>
      <button type="button" onClick={() => setPanelView('settings')}>
        open settings
      </button>
      <button type="button" onClick={() => setPanelView('chat')}>
        back to chat
      </button>
      <button type="button" onClick={() => setAssistantState('speaking')}>
        set speaking
      </button>
      <button type="button" onClick={() => setSelectedInputDeviceId('usb-mic')}>
        set usb mic
      </button>
    </div>
  );
}

describe('uiStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('applies panel view and assistant state actions with closePanel resetting to chat', () => {
    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(screen.getByLabelText('panel-view')).toHaveTextContent('chat');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
    expect(screen.getByLabelText('selected-input-device')).toHaveTextContent('default');

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'open settings' }));
    expect(screen.getByLabelText('panel-view')).toHaveTextContent('settings');

    fireEvent.click(screen.getByRole('button', { name: 'set speaking' }));
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('speaking');

    fireEvent.click(screen.getByRole('button', { name: 'close panel' }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(screen.getByLabelText('panel-view')).toHaveTextContent('chat');

    fireEvent.click(screen.getByRole('button', { name: 'back to chat' }));
    expect(screen.getByLabelText('panel-view')).toHaveTextContent('chat');
  });

  it('hydrates and persists the selected input device', () => {
    window.localStorage.setItem('livepair.selectedInputDeviceId', 'built-in-mic');

    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('selected-input-device')).toHaveTextContent('built-in-mic');

    fireEvent.click(screen.getByRole('button', { name: 'set usb mic' }));

    expect(screen.getByLabelText('selected-input-device')).toHaveTextContent('usb-mic');
    expect(window.localStorage.getItem('livepair.selectedInputDeviceId')).toBe('usb-mic');
  });
});
