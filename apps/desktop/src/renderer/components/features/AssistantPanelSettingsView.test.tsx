import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

type MockMediaDeviceInfo = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;

const enumerateDevices = vi.fn<() => Promise<MockMediaDeviceInfo[]>>();
const mediaDevicesEvents = new EventTarget();

function installMediaDevicesMock(): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices,
      addEventListener: mediaDevicesEvents.addEventListener.bind(mediaDevicesEvents),
      removeEventListener: mediaDevicesEvents.removeEventListener.bind(mediaDevicesEvents),
    },
  });
}

async function renderSettings(settings = DEFAULT_DESKTOP_SETTINGS): Promise<ReturnType<typeof render>> {
  useSettingsStore.setState({
    settings,
    isReady: true,
  });
  useUiStore.getState().initializeSettingsUi(settings);

  await act(async () => {
    await useUiStore.getState().initializeDevicePreferences();
    await useUiStore.getState().initializeDisplayPreferences();
  });

  return render(<AssistantPanelSettingsView />);
}

describe('AssistantPanelSettingsView', () => {
  beforeEach(() => {
    resetDesktopStores();
    enumerateDevices.mockReset();
    enumerateDevices.mockResolvedValue([]);
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listDisplays = vi.fn(async () => [
      { id: 'display-2', label: 'Display 2', isPrimary: false },
      { id: 'display-3', label: 'Display 3', isPrimary: false },
    ]);
    installMediaDevicesMock();
  });

  it('renders settings sections with hydrated backend values', async () => {
    await renderSettings({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://runtime.livepair.dev/api',
    });

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://runtime.livepair.dev/api',
    );
  });

  it('applies a valid backend URL override on blur through the settings store', async () => {
    await renderSettings();

    const backendUrlInput = screen.getByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, { target: { value: ' https://api.livepair.dev/v1/ ' } });
      fireEvent.blur(backendUrlInput);
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        backendUrl: 'https://api.livepair.dev/v1',
      });
    });

    expect(backendUrlInput).toHaveValue('https://api.livepair.dev/v1');
  });

  it('rejects invalid backend URLs on blur and preserves the applied value', async () => {
    await renderSettings();

    const backendUrlInput = screen.getByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, { target: { value: 'ftp://bad.example.com' } });
      fireEvent.blur(backendUrlInput);
    });

    expect(window.bridge.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid http:// or https:// URL.')).toBeVisible();
    expect(backendUrlInput).toHaveValue('ftp://bad.example.com');
  });

  it('updates persisted theme and preferred mode selections', async () => {
    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Use dark theme' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preferred mode/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ themePreference: 'dark' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ preferredMode: 'thinking' });
  });

  it('persists display selections through the settings store', async () => {
    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /screen capture display/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Display 2' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dock and panel display/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('option', { name: 'Display 3' }).at(-1)!);
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedCaptureDisplayId: 'display-2',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOverlayDisplayId: 'display-3',
    });
  });

  it('renders enumerated devices and resets invalid stored selections to default', async () => {
    enumerateDevices.mockResolvedValue([
      {
        deviceId: 'default',
        groupId: 'group-default',
        kind: 'audioinput',
        label: 'Default microphone',
      },
      {
        deviceId: 'usb-mic',
        groupId: 'group-2',
        kind: 'audioinput',
        label: 'USB Microphone',
      },
      {
        deviceId: 'default',
        groupId: 'group-default',
        kind: 'audiooutput',
        label: 'Default speakers',
      },
      {
        deviceId: 'desk-speakers',
        groupId: 'group-3',
        kind: 'audiooutput',
        label: 'Desk Speakers',
      },
    ]);

    await renderSettings({
      ...DEFAULT_DESKTOP_SETTINGS,
      selectedInputDeviceId: 'missing-mic',
      selectedOutputDeviceId: 'missing-speaker',
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        selectedInputDeviceId: 'default',
      });
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'default',
    });
    expect(screen.getByRole('button', { name: /input device/i })).toHaveTextContent(
      'System default',
    );
    expect(screen.getByRole('button', { name: /output device/i })).toHaveTextContent(
      'System default',
    );
  });

  it('refreshes device options after a devicechange event', async () => {
    enumerateDevices
      .mockResolvedValueOnce([
        {
          deviceId: 'default',
          groupId: 'group-default',
          kind: 'audioinput',
          label: 'Default microphone',
        },
      ])
      .mockResolvedValueOnce([
        {
          deviceId: 'default',
          groupId: 'group-default',
          kind: 'audioinput',
          label: 'Default microphone',
        },
        {
          deviceId: 'usb-mic',
          groupId: 'group-2',
          kind: 'audioinput',
          label: 'USB Microphone',
        },
      ]);

    await renderSettings();
    await act(async () => {
      mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
    });

    await waitFor(() => {
      expect(enumerateDevices).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps missing saved displays visible and shows a warning instead of auto-resetting them', async () => {
    await renderSettings({
      ...DEFAULT_DESKTOP_SETTINGS,
      selectedCaptureDisplayId: 'missing-display',
    });

    expect(screen.getByRole('button', { name: /screen capture display/i })).toHaveTextContent(
      'Saved display unavailable',
    );
    expect(screen.getByText(/Screen capture display is unavailable/i)).toBeVisible();
    expect(window.bridge.updateSettings).not.toHaveBeenCalledWith({
      selectedCaptureDisplayId: 'primary',
    });
  });
});
