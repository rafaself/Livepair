import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UiStoreProvider } from '../../store/uiStore';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

type MockMediaDeviceInfo = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;

const enumerateDevices = vi.fn<() => Promise<MockMediaDeviceInfo[]>>();
const mediaDevicesEvents = new EventTarget();
const getBackendBaseUrl = vi.fn<() => Promise<string>>();
const setBackendBaseUrl = vi.fn<(url: string) => Promise<string>>();

function installMediaDevicesMock(): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices,
      addEventListener: mediaDevicesEvents.addEventListener.bind(mediaDevicesEvents),
      removeEventListener: mediaDevicesEvents.removeEventListener.bind(mediaDevicesEvents),
    } satisfies Pick<
      MediaDevices,
      'enumerateDevices' | 'addEventListener' | 'removeEventListener'
    >,
  });
}

async function renderSettings(): Promise<ReturnType<typeof render>> {
  const rendered = render(
    <UiStoreProvider>
      <AssistantPanelSettingsView />
    </UiStoreProvider>,
  );

  await act(async () => {
    await Promise.resolve();
  });

  return rendered;
}

describe('AssistantPanelSettingsView', () => {
  beforeEach(() => {
    enumerateDevices.mockReset();
    getBackendBaseUrl.mockReset();
    getBackendBaseUrl.mockResolvedValue('http://localhost:3000');
    setBackendBaseUrl.mockReset();
    setBackendBaseUrl.mockImplementation(async (url) => url);
    window.localStorage.clear();
    window.bridge.getBackendBaseUrl = getBackendBaseUrl;
    window.bridge.setBackendBaseUrl = setBackendBaseUrl;
    installMediaDevicesMock();
  });

  afterEach(() => {
    mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
  });

  it('renders settings sections', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();
  });

  it('renders the backend URL as a textbox using the current runtime value', async () => {
    getBackendBaseUrl.mockResolvedValue('https://runtime.livepair.dev/api/');
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /backend url/i })).toHaveValue(
        'https://runtime.livepair.dev/api',
      );
    });
  });

  it('renders the backend URL field with the input stacked below its label', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    expect(screen.getByRole('textbox', { name: /backend url/i }).closest('.field-list')).toHaveClass(
      'assistant-panel__settings-field-list--stacked',
    );
  });

  it('applies a valid backend URL override on blur', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    const backendUrlInput = await screen.findByRole('textbox', { name: /backend url/i });

    fireEvent.change(backendUrlInput, { target: { value: ' https://api.livepair.dev/v1/ ' } });
    fireEvent.blur(backendUrlInput);

    await waitFor(() => {
      expect(setBackendBaseUrl).toHaveBeenCalledWith('https://api.livepair.dev/v1');
    });

    expect(backendUrlInput).toHaveValue('https://api.livepair.dev/v1');
    expect(window.localStorage.getItem('livepair.backendUrl')).toBe('https://api.livepair.dev/v1');
  });

  it('rejects invalid backend URLs on blur and preserves the applied value', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    const backendUrlInput = await screen.findByRole('textbox', { name: /backend url/i });
    expect(backendUrlInput).toHaveValue('http://localhost:3000');

    fireEvent.change(backendUrlInput, { target: { value: 'ftp://bad.example.com' } });
    fireEvent.blur(backendUrlInput);

    expect(setBackendBaseUrl).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('livepair.backendUrl')).toBe('http://localhost:3000');
    expect(screen.getByText('Enter a valid http:// or https:// URL.')).toBeVisible();
  });

  it('lets the user lock the panel from settings', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    const lockPanelSwitch = screen.getByRole('switch', { name: /lock panel/i });
    expect(lockPanelSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Lock panel')).toBeVisible();

    fireEvent.click(lockPanelSwitch);

    expect(screen.getByRole('switch', { name: /lock panel/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('lets the user change preferred mode from settings', async () => {
    enumerateDevices.mockResolvedValue([]);
    await renderSettings();

    const preferredModeSelect = screen.getByRole('button', { name: /preferred mode/i });
    expect(preferredModeSelect).toHaveTextContent('Fast');

    fireEvent.click(preferredModeSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Thinking' }));

    expect(screen.getByRole('button', { name: /preferred mode/i })).toHaveTextContent('Thinking');
  });

  it('uses compact mode sizing and constrained input-device sizing', async () => {
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
    ]);

    await renderSettings();

    expect(screen.getByText('Preferred mode').closest('.field-list')).toHaveClass(
      'assistant-panel__settings-field-list',
    );
    expect(screen.getByText('Input device').closest('.field-list')).toHaveClass(
      'assistant-panel__settings-field-list',
    );
    expect(screen.getByRole('button', { name: /preferred mode/i }).closest('.select')).toHaveClass(
      'assistant-panel__settings-select',
    );
    expect(screen.getByRole('button', { name: /preferred mode/i }).closest('.select')).toHaveClass(
      'assistant-panel__settings-mode-select',
    );
    expect(screen.getByRole('button', { name: /input device/i }).closest('.select')).toHaveClass(
      'assistant-panel__settings-select',
    );
    expect(screen.getByRole('button', { name: /input device/i }).closest('.select')).toHaveClass(
      'assistant-panel__settings-input-select',
    );
  });

  it('renders system default plus enumerated microphones', async () => {
    enumerateDevices.mockResolvedValue([
      {
        deviceId: 'default',
        groupId: 'group-default',
        kind: 'audioinput',
        label: 'Default microphone',
      },
      {
        deviceId: 'built-in-mic',
        groupId: 'group-1',
        kind: 'audioinput',
        label: 'Built-in Microphone',
      },
      {
        deviceId: 'usb-mic',
        groupId: 'group-2',
        kind: 'audioinput',
        label: 'USB Microphone',
      },
      {
        deviceId: 'speaker-1',
        groupId: 'group-3',
        kind: 'audiooutput',
        label: 'Desk Speakers',
      },
    ]);

    await renderSettings();

    const inputDeviceSelect = await screen.findByRole('button', { name: /input device/i });
    expect(inputDeviceSelect).toHaveTextContent('System default');

    await act(async () => {
      fireEvent.click(inputDeviceSelect);
    });

    expect(screen.getByRole('option', { name: 'System default' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Built-in Microphone' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'USB Microphone' })).toBeVisible();
    expect(screen.queryByRole('option', { name: 'Desk Speakers' })).toBeNull();
  });

  it('updates the selected microphone when the user chooses a device', async () => {
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
    ]);

    await renderSettings();

    const inputDeviceSelect = await screen.findByRole('button', { name: /input device/i });
    expect(inputDeviceSelect).toHaveTextContent('System default');

    await act(async () => {
      fireEvent.click(inputDeviceSelect);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'USB Microphone' }));
    });

    expect(screen.getByRole('button', { name: /input device/i })).toHaveTextContent(
      'USB Microphone',
    );
    expect(window.localStorage.getItem('livepair.selectedInputDeviceId')).toBe('usb-mic');
  });

  it('falls back to generic labels when microphone labels are unavailable', async () => {
    enumerateDevices.mockResolvedValue([
      {
        deviceId: 'default',
        groupId: 'group-default',
        kind: 'audioinput',
        label: '',
      },
      {
        deviceId: 'mic-1',
        groupId: 'group-1',
        kind: 'audioinput',
        label: '',
      },
      {
        deviceId: 'mic-2',
        groupId: 'group-2',
        kind: 'audioinput',
        label: '',
      },
    ]);

    await renderSettings();

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: /input device/i }));
    });

    expect(screen.getByRole('option', { name: 'System default' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Microphone 1' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Microphone 2' })).toBeVisible();
  });

  it('disables microphone selection when no inputs are available', async () => {
    enumerateDevices.mockResolvedValue([
      {
        deviceId: 'speaker-1',
        groupId: 'group-3',
        kind: 'audiooutput',
        label: 'Desk Speakers',
      },
    ]);

    await renderSettings();

    const inputDeviceSelect = await screen.findByRole('button', { name: /input device/i });
    expect(inputDeviceSelect).toBeDisabled();
    expect(inputDeviceSelect).toHaveTextContent('No microphone detected');
  });

  it('resets an invalid persisted microphone selection to system default', async () => {
    window.localStorage.setItem('livepair.selectedInputDeviceId', 'missing-mic');
    enumerateDevices.mockResolvedValue([
      {
        deviceId: 'default',
        groupId: 'group-default',
        kind: 'audioinput',
        label: 'Default microphone',
      },
      {
        deviceId: 'built-in-mic',
        groupId: 'group-1',
        kind: 'audioinput',
        label: 'Built-in Microphone',
      },
    ]);

    await renderSettings();

    expect(await screen.findByRole('button', { name: /input device/i })).toHaveTextContent(
      'System default',
    );
    expect(window.localStorage.getItem('livepair.selectedInputDeviceId')).toBe('default');
  });

  it('refreshes microphone options after a devicechange event', async () => {
    enumerateDevices
      .mockResolvedValueOnce([
        {
          deviceId: 'default',
          groupId: 'group-default',
          kind: 'audioinput',
          label: 'Default microphone',
        },
        {
          deviceId: 'built-in-mic',
          groupId: 'group-1',
          kind: 'audioinput',
          label: 'Built-in Microphone',
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
          deviceId: 'built-in-mic',
          groupId: 'group-1',
          kind: 'audioinput',
          label: 'Built-in Microphone',
        },
        {
          deviceId: 'usb-mic',
          groupId: 'group-2',
          kind: 'audioinput',
          label: 'USB Microphone',
        },
      ]);

    await renderSettings();

    const inputDeviceSelect = await screen.findByRole('button', { name: /input device/i });
    await act(async () => {
      fireEvent.click(inputDeviceSelect);
    });
    expect(screen.queryByRole('option', { name: 'USB Microphone' })).toBeNull();

    await act(async () => {
      mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
    });

    await waitFor(() => {
      expect(enumerateDevices).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /input device/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /input device/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'USB Microphone' })).toBeVisible();
    });
  });
});
