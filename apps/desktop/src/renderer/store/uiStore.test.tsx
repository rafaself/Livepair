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
    setBackendUrl,
    setSelectedInputDeviceId,
    setSelectedOutputDeviceId,
    setThemePreference,
    toggleDebugMode,
  } = useUiStore();

  return (
    <div>
      <output aria-label="panel-open">{String(state.isPanelOpen)}</output>
      <output aria-label="panel-view">{state.panelView}</output>
      <output aria-label="assistant-state">{state.assistantState}</output>
      <output aria-label="backend-url">{state.backendUrl}</output>
      <output aria-label="selected-input-device">{state.selectedInputDeviceId}</output>
      <output aria-label="selected-output-device">{state.selectedOutputDeviceId}</output>
      <output aria-label="theme-preference">{state.themePreference}</output>
      <output aria-label="debug-mode">{String(state.isDebugMode)}</output>

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
      <button type="button" onClick={() => setBackendUrl('https://api.livepair.dev')}>
        set backend url
      </button>
      <button type="button" onClick={() => setSelectedInputDeviceId('usb-mic')}>
        set usb mic
      </button>
      <button type="button" onClick={() => setSelectedOutputDeviceId('desk-speakers')}>
        set desk speakers
      </button>
      <button type="button" onClick={() => setThemePreference('light')}>
        set light theme
      </button>
      <button type="button" onClick={() => setThemePreference('system')}>
        set system theme
      </button>
      <button type="button" onClick={toggleDebugMode}>
        toggle debug mode
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
    expect(screen.getByLabelText('backend-url')).toHaveTextContent('http://localhost:3000');
    expect(screen.getByLabelText('selected-input-device')).toHaveTextContent('default');
    expect(screen.getByLabelText('selected-output-device')).toHaveTextContent('default');
    expect(screen.getByLabelText('theme-preference')).toHaveTextContent('system');

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

  it('hydrates and persists the selected output device', () => {
    window.localStorage.setItem('livepair.selectedOutputDeviceId', 'usb-headset');

    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('selected-output-device')).toHaveTextContent('usb-headset');

    fireEvent.click(screen.getByRole('button', { name: 'set desk speakers' }));

    expect(screen.getByLabelText('selected-output-device')).toHaveTextContent('desk-speakers');
    expect(window.localStorage.getItem('livepair.selectedOutputDeviceId')).toBe('desk-speakers');
  });

  it('hydrates and persists the backend URL', () => {
    window.localStorage.setItem('livepair.backendUrl', 'https://persisted.livepair.dev');

    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('backend-url')).toHaveTextContent(
      'https://persisted.livepair.dev',
    );

    fireEvent.click(screen.getByRole('button', { name: 'set backend url' }));

    expect(screen.getByLabelText('backend-url')).toHaveTextContent('https://api.livepair.dev');
    expect(window.localStorage.getItem('livepair.backendUrl')).toBe('https://api.livepair.dev');
  });

  it('hydrates and persists the theme preference', () => {
    window.localStorage.setItem('livepair.themePreference', 'light');

    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('theme-preference')).toHaveTextContent('light');

    fireEvent.click(screen.getByRole('button', { name: 'set system theme' }));

    expect(screen.getByLabelText('theme-preference')).toHaveTextContent('system');
    expect(window.localStorage.getItem('livepair.themePreference')).toBe('system');
  });

  it('falls back to the system theme when the persisted preference is invalid', () => {
    window.localStorage.setItem('livepair.themePreference', 'sepia');

    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('theme-preference')).toHaveTextContent('system');

    fireEvent.click(screen.getByRole('button', { name: 'set light theme' }));

    expect(window.localStorage.getItem('livepair.themePreference')).toBe('light');
  });

  it('toggles debug mode on and off', () => {
    render(
      <UiStoreProvider>
        <UiStoreHarness />
      </UiStoreProvider>,
    );

    expect(screen.getByLabelText('debug-mode')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'toggle debug mode' }));
    expect(screen.getByLabelText('debug-mode')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'toggle debug mode' }));
    expect(screen.getByLabelText('debug-mode')).toHaveTextContent('false');
  });
});
