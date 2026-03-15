import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../../shared/settings';
import { useSettingsStore } from '../../../../store/settingsStore';
import { useSessionStore } from '../../../../store/sessionStore';
import { resetDesktopStores } from '../../../../test/store';
import { useUiStore } from '../../../../store/uiStore';
import { AssistantPanelSettingsView } from './AssistantPanelSettingsView';

type MockMediaDeviceInfo = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;

const enumerateDevices = vi.fn<() => Promise<MockMediaDeviceInfo[]>>();
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const mediaDevicesEvents = new EventTarget();
const OVERLAY_DISPLAY = {
  displayId: '1',
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 23, width: 2560, height: 1417 },
  scaleFactor: 2,
} as const;

function createScreenSource(id: string, name: string, displayId: string) {
  return { id, name, kind: 'screen' as const, displayId };
}

function createWindowSource(id: string, name: string) {
  return { id, name, kind: 'window' as const };
}

function installMediaDevicesMock(): void {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices,
      getUserMedia,
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
  useSessionStore.getState().setScreenCaptureSourceSnapshot({
    sources: [
      createScreenSource('screen:1:0', 'Entire Screen', '1'),
      createWindowSource('window:42:0', 'VSCode'),
    ],
    selectedSourceId: null,
    overlayDisplay: OVERLAY_DISPLAY,
  });

  await act(async () => {
    await useUiStore.getState().initializeDevicePreferences();
  });

  return render(<AssistantPanelSettingsView />);
}

describe('AssistantPanelSettingsView', () => {
  beforeEach(() => {
    resetDesktopStores();
    enumerateDevices.mockReset();
    enumerateDevices.mockResolvedValue([]);
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream);
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: null,
      overlayDisplay: OVERLAY_DISPLAY,
    }));
    window.bridge.selectScreenCaptureSource = vi.fn(async (sourceId) => ({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: sourceId,
      overlayDisplay: OVERLAY_DISPLAY,
    }));
    installMediaDevicesMock();
  });

  it('renders settings sections with hydrated backend values', async () => {
    useUiStore.setState({ isDebugMode: true });
    await renderSettings({
      ...DEFAULT_DESKTOP_SETTINGS,
      backendUrl: 'https://runtime.livepair.dev/api',
    });

    const videoHeading = screen.getByRole('heading', { name: 'Video' });
    const audioHeading = screen.getByRole('heading', { name: 'Audio' });

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'General' })).toBeVisible();
    expect(videoHeading).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Backend' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeVisible();
    expect(
      videoHeading.compareDocumentPosition(audioHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://runtime.livepair.dev/api',
    );
    expect(screen.getByRole('switch', { name: 'Echo cancellation' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Noise suppression' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Auto gain control' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('lists available screen capture sources and persists the selected source from settings', async () => {
    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /screen source/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'VSCode' }));
    });

    expect(window.bridge.selectScreenCaptureSource).toHaveBeenCalledWith('window:42:0');
  });

  it('applies a valid backend URL override on blur through the settings store', async () => {
    useUiStore.setState({ isDebugMode: true });
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
    useUiStore.setState({ isDebugMode: true });
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

  it('keeps preferred mode locked to fast in debug mode', async () => {
    useUiStore.setState({ isDebugMode: true });
    await renderSettings();

    expect(screen.getByRole('button', { name: /preferred mode/i })).toHaveTextContent('Fast');
    expect(screen.getByRole('button', { name: /preferred mode/i })).toBeDisabled();
  });

  it('renders enumerated devices, resets invalid stored selections, and persists chosen devices', async () => {
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

    const inputDeviceButton = screen.getByRole('button', { name: /input device/i });
    const outputDeviceButton = screen.getByRole('button', { name: /output device/i });

    expect(inputDeviceButton).toHaveTextContent('System default');
    expect(outputDeviceButton).toHaveTextContent('System default');
    expect(inputDeviceButton).toBeEnabled();
    expect(outputDeviceButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(inputDeviceButton);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'USB Microphone' }));
    });

    await act(async () => {
      fireEvent.click(outputDeviceButton);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Desk Speakers' }));
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedInputDeviceId: 'usb-mic',
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'desk-speakers',
    });
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

  it('persists browser audio cleanup toggles from the audio section', async () => {
    useUiStore.setState({ isDebugMode: true });
    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Echo cancellation' }));
      fireEvent.click(screen.getByRole('switch', { name: 'Noise suppression' }));
      fireEvent.click(screen.getByRole('switch', { name: 'Auto gain control' }));
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
  });

  // --- HDMI / DisplayPort output devices integration tests ---

  it('renders all HDMI and DisplayPort options in the output dropdown', async () => {
    enumerateDevices.mockResolvedValue([
      { deviceId: 'default', groupId: 'group-default', kind: 'audioinput', label: 'Default Microphone' },
      { deviceId: 'default', groupId: 'group-default', kind: 'audiooutput', label: 'Default Output' },
      { deviceId: 'hdmi-1', groupId: 'group-h1', kind: 'audiooutput', label: 'HDMI Output 1' },
      { deviceId: 'hdmi-2', groupId: 'group-h2', kind: 'audiooutput', label: 'HDMI Output 2' },
      { deviceId: 'hdmi-3', groupId: 'group-h3', kind: 'audiooutput', label: 'HDMI Output 3' },
      { deviceId: 'dp-1', groupId: 'group-d1', kind: 'audiooutput', label: 'DisplayPort Output 1' },
      { deviceId: 'dp-2', groupId: 'group-d2', kind: 'audiooutput', label: 'DisplayPort Output 2' },
    ]);

    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /output device/i }));
    });

    expect(screen.getByRole('option', { name: 'System default' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HDMI Output 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HDMI Output 2' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HDMI Output 3' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'DisplayPort Output 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'DisplayPort Output 2' })).toBeInTheDocument();
  });

  it('keeps all distinct audio profiles as separate entries in the output dropdown', async () => {
    enumerateDevices.mockResolvedValue([
      { deviceId: 'default', groupId: 'group-default', kind: 'audioinput', label: 'Default Microphone' },
      { deviceId: 'headset', groupId: 'group-hs', kind: 'audiooutput', label: 'Headset' },
      { deviceId: 'handsfree', groupId: 'group-hf', kind: 'audiooutput', label: 'Handsfree' },
      { deviceId: 'analog', groupId: 'group-an', kind: 'audiooutput', label: 'Analog Output' },
      { deviceId: 'spdif', groupId: 'group-sp', kind: 'audiooutput', label: 'Digital Output (S/PDIF)' },
      { deviceId: 'hdmi-1', groupId: 'group-h1', kind: 'audiooutput', label: 'HDMI Output 1' },
      { deviceId: 'hdmi-2', groupId: 'group-h2', kind: 'audiooutput', label: 'HDMI Output 2' },
    ]);

    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /output device/i }));
    });

    expect(screen.getByRole('option', { name: 'System default' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Headset' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Handsfree' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Analog Output' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Digital Output (S/PDIF)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HDMI Output 1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'HDMI Output 2' })).toBeInTheDocument();
  });

  it('persists the representative HDMI output selection after choosing it from the dropdown', async () => {
    enumerateDevices.mockResolvedValue([
      { deviceId: 'default', groupId: 'group-default', kind: 'audioinput', label: 'Default Microphone' },
      { deviceId: 'default', groupId: 'group-default', kind: 'audiooutput', label: 'Default Output' },
      { deviceId: 'hdmi-1', groupId: 'group-h1', kind: 'audiooutput', label: 'HDMI Output 1' },
      { deviceId: 'hdmi-2', groupId: 'group-h2', kind: 'audiooutput', label: 'HDMI Output 2' },
      { deviceId: 'hdmi-3', groupId: 'group-h3', kind: 'audiooutput', label: 'HDMI Output 3' },
    ]);

    await renderSettings();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /output device/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'HDMI Output 1' }));
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'hdmi-1',
    });
    expect(screen.getByRole('button', { name: /output device/i })).toHaveTextContent(
      'HDMI Output 1',
    );
  });
});
