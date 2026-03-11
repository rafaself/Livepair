import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { useAssistantPanelSettingsController } from './useAssistantPanelSettingsController';

function HookHarness(): JSX.Element {
  const controller = useAssistantPanelSettingsController();

  return (
    <div>
      <input
        aria-label="backend url"
        value={controller.backendUrlDraft}
        onChange={(event) => controller.handleBackendUrlChange(event.currentTarget.value)}
        onBlur={() => {
          void controller.handleBackendUrlBlur();
        }}
      />
      <output aria-label="backend-url-error">{controller.backendUrlError ?? 'none'}</output>
      <output aria-label="input-options">
        {controller.inputDeviceOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="output-options">
        {controller.outputDeviceOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="debug-mode">{String(controller.isDebugMode)}</output>
      <button type="button" onClick={controller.toggleDebugMode}>
        toggle debug
      </button>
      <button type="button" onClick={controller.togglePanelPinned}>
        toggle pinned
      </button>
      <button type="button" onClick={() => controller.setPreferredMode('fast')}>
        set fast
      </button>
      <button type="button" onClick={() => controller.setSelectedInputDeviceId('usb-mic')}>
        set input
      </button>
      <button type="button" onClick={() => controller.setSelectedOutputDeviceId('desk-speakers')}>
        set output
      </button>
      <output aria-label="echo-cancellation">{String(controller.voiceEchoCancellationEnabled)}</output>
      <output aria-label="noise-suppression">{String(controller.voiceNoiseSuppressionEnabled)}</output>
      <output aria-label="auto-gain-control">{String(controller.voiceAutoGainControlEnabled)}</output>
      <button type="button" onClick={() => controller.setVoiceEchoCancellationEnabled(false)}>
        disable echo cancellation
      </button>
      <button type="button" onClick={() => controller.setVoiceNoiseSuppressionEnabled(false)}>
        disable noise suppression
      </button>
      <button type="button" onClick={() => controller.setVoiceAutoGainControlEnabled(false)}>
        disable auto gain control
      </button>
      <button type="button" onClick={() => controller.setThemePreference('dark')}>
        set dark
      </button>
    </div>
  );
}

describe('useAssistantPanelSettingsController', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        backendUrl: 'https://persisted.livepair.dev',
      },
      isReady: true,
    });
    useUiStore.getState().initializeSettingsUi(useSettingsStore.getState().settings);
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
  });

  it('normalizes and persists a valid backend url on blur', async () => {
    render(<HookHarness />);

    const backendUrlInput = screen.getByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, {
        target: { value: ' https://api.livepair.dev/v1/ ' },
      });
      fireEvent.blur(backendUrlInput);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        backendUrl: 'https://api.livepair.dev/v1',
      });
    });
    expect(backendUrlInput).toHaveValue('https://api.livepair.dev/v1');
    expect(screen.getByLabelText('backend-url-error')).toHaveTextContent('none');
  });

  it('rejects invalid backend urls without persisting them', async () => {
    render(<HookHarness />);

    const backendUrlInput = screen.getByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, {
        target: { value: 'ftp://bad.example.com' },
      });
      fireEvent.blur(backendUrlInput);
    });

    expect(window.bridge.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText('backend-url-error')).toHaveTextContent(
      'Enter a valid http:// or https:// URL.',
    );
    expect(backendUrlInput).toHaveValue('ftp://bad.example.com');
  });

  it('restores the persisted backend url and surfaces an error when persistence fails', async () => {
    window.bridge.updateSettings = vi.fn(async () => {
      throw new Error('write failed');
    });

    render(<HookHarness />);

    const backendUrlInput = screen.getByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, {
        target: { value: 'https://draft.livepair.dev' },
      });
      fireEvent.blur(backendUrlInput);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('backend-url-error')).toHaveTextContent(
        'Unable to update backend URL.',
      );
    });
    expect(backendUrlInput).toHaveValue('https://persisted.livepair.dev');
  });

  it('falls back to unavailable device options when the ui store has not hydrated devices', () => {
    render(<HookHarness />);

    expect(screen.getByLabelText('input-options')).toHaveTextContent(
      'Voice input unavailable in text-only release',
    );
    expect(screen.getByLabelText('output-options')).toHaveTextContent(
      'Voice output unavailable in text-only release',
    );
  });

  it('routes settings mutations through the stores and exposes debug mode toggles', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle pinned' }));
    fireEvent.click(screen.getByRole('button', { name: 'set fast' }));
    fireEvent.click(screen.getByRole('button', { name: 'set input' }));
    fireEvent.click(screen.getByRole('button', { name: 'set output' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable echo cancellation' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable noise suppression' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable auto gain control' }));
    fireEvent.click(screen.getByRole('button', { name: 'set dark' }));

    await waitFor(() => {
      expect(screen.getByLabelText('debug-mode')).toHaveTextContent('false');
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ isPanelPinned: true });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ preferredMode: 'fast' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ selectedInputDeviceId: 'usb-mic' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'desk-speakers',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      voiceEchoCancellationEnabled: false,
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      voiceNoiseSuppressionEnabled: false,
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      voiceAutoGainControlEnabled: false,
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ themePreference: 'dark' });
  });
});
