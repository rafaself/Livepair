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
      <output aria-label="capture-options">
        {controller.captureDisplayOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="overlay-options">
        {controller.overlayDisplayOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="display-issues">{controller.displayIssueSummaries.join('|') || 'none'}</output>
      <output aria-label="debug-mode">{String(controller.isDebugMode)}</output>
      <button type="button" onClick={controller.toggleDebugMode}>
        toggle debug
      </button>
      <button type="button" onClick={controller.togglePanelPinned}>
        toggle pinned
      </button>
      <button type="button" onClick={() => controller.setPreferredMode('thinking')}>
        set thinking
      </button>
      <button type="button" onClick={() => controller.setSelectedInputDeviceId('usb-mic')}>
        set input
      </button>
      <button type="button" onClick={() => controller.setSelectedOutputDeviceId('desk-speakers')}>
        set output
      </button>
      <button type="button" onClick={() => controller.setSelectedCaptureDisplayId('display-2')}>
        set capture display
      </button>
      <button type="button" onClick={() => controller.setSelectedOverlayDisplayId('display-3')}>
        set overlay display
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
    useUiStore.setState({
      displayOptions: [
        { id: 'display-2', label: 'Display 2', isPrimary: false },
        { id: 'display-3', label: 'Display 3', isPrimary: false },
      ],
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listDisplays = vi.fn(async () => [
      { id: 'display-2', label: 'Display 2', isPrimary: false },
      { id: 'display-3', label: 'Display 3', isPrimary: false },
    ]);
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

    expect(screen.getByLabelText('input-options')).toHaveTextContent('No microphone detected');
    expect(screen.getByLabelText('output-options')).toHaveTextContent('No speaker detected');
  });

  it('builds display options with the primary sentinel and preserves unavailable saved displays', () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        selectedCaptureDisplayId: 'missing-display',
      },
      isReady: true,
    });

    render(<HookHarness />);

    expect(screen.getByLabelText('capture-options')).toHaveTextContent(
      'Primary display|Display 2|Display 3|Saved display unavailable',
    );
  });

  it('routes settings mutations through the stores and exposes debug mode toggles', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle pinned' }));
    fireEvent.click(screen.getByRole('button', { name: 'set thinking' }));
    fireEvent.click(screen.getByRole('button', { name: 'set input' }));
    fireEvent.click(screen.getByRole('button', { name: 'set output' }));
    fireEvent.click(screen.getByRole('button', { name: 'set capture display' }));
    fireEvent.click(screen.getByRole('button', { name: 'set overlay display' }));
    fireEvent.click(screen.getByRole('button', { name: 'set dark' }));

    await waitFor(() => {
      expect(screen.getByLabelText('debug-mode')).toHaveTextContent('true');
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ isPanelPinned: true });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ preferredMode: 'thinking' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ selectedInputDeviceId: 'usb-mic' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'desk-speakers',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedCaptureDisplayId: 'display-2',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOverlayDisplayId: 'display-3',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ themePreference: 'dark' });
  });
});
