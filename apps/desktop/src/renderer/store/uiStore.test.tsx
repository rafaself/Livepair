import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { selectAssistantRuntimeState } from '../runtime';
import { resetDesktopStores } from '../test/store';
import { useSessionStore } from './sessionStore';
import { useSettingsStore } from './settingsStore';
import { useUiStore } from './uiStore';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();
const getUserMedia = vi.fn<() => Promise<MediaStream>>();
const mediaDevicesEvents = new EventTarget();

function createDevice(
  overrides: Partial<MediaDeviceInfo> & Pick<MediaDeviceInfo, 'deviceId' | 'kind'>,
): MediaDeviceInfo {
  return {
    deviceId: overrides.deviceId,
    groupId: overrides.groupId ?? `${overrides.deviceId}-group`,
    kind: overrides.kind,
    label: overrides.label ?? overrides.deviceId,
    toJSON: overrides.toJSON ?? (() => ({})),
  } satisfies MediaDeviceInfo;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('uiStore', () => {
  beforeEach(() => {
    resetDesktopStores();
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      ...patch,
    }));
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices,
        getUserMedia,
        addEventListener: mediaDevicesEvents.addEventListener.bind(mediaDevicesEvents),
        removeEventListener: mediaDevicesEvents.removeEventListener.bind(mediaDevicesEvents),
      },
    });
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    enumerateDevices.mockReset();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream);
  });

  it('defaults debug mode to off', () => {
    expect(useUiStore.getState().isDebugMode).toBe(false);
  });

  it('defaults the assistant panel to open on app startup', () => {
    expect(useUiStore.getState().isPanelOpen).toBe(true);
  });

  it('stores the composer microphone preference independently and resets it to enabled by default', () => {
    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(true);

    useUiStore.getState().toggleComposerMicrophoneEnabled();
    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);

    useUiStore.getState().setComposerMicrophoneEnabled(true);
    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(true);

    useUiStore.getState().toggleComposerMicrophoneEnabled();
    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(false);

    useUiStore.getState().reset();
    expect(useUiStore.getState().isComposerMicrophoneEnabled).toBe(true);
  });

  it('toggles the panel and resets the current view when closing', () => {
    useUiStore.getState().togglePanel();
    expect(useUiStore.getState().isPanelOpen).toBe(false);

    useUiStore.getState().togglePanel();
    useUiStore.getState().setPanelView('settings');
    expect(useUiStore.getState().panelView).toBe('settings');

    useUiStore.getState().closePanel();
    expect(useUiStore.getState()).toEqual(
      expect.objectContaining({
        isPanelOpen: false,
        panelView: 'chat',
      }),
    );
  });

  it('keeps runtime assistant state in the session store', () => {
    useUiStore.setState({ isDebugMode: true });

    useSessionStore.getState().setAssistantState('speaking');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('speaking');
    expect(useUiStore.getState().isDebugMode).toBe(true);

    useUiStore.getState().toggleDebugMode();
    expect(useUiStore.getState().isDebugMode).toBe(false);
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('speaking');
  });

  it('clears screen frame dump debug state when debug mode is turned off', () => {
    useUiStore.setState({
      isDebugMode: true,
      saveScreenFramesEnabled: true,
      screenFrameDumpDirectoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    });

    useUiStore.getState().toggleDebugMode();

    expect(useUiStore.getState()).toEqual(
      expect.objectContaining({
        isDebugMode: false,
        saveScreenFramesEnabled: false,
        screenFrameDumpDirectoryPath: null,
      }),
    );
  });

  it('resets transient debug state and device options back to defaults', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({
        deviceId: 'default',
        groupId: 'group-input',
        kind: 'audioinput',
        label: 'Default microphone',
      }),
      createDevice({
        deviceId: 'default',
        groupId: 'group-output',
        kind: 'audiooutput',
        label: 'Default speakers',
      }),
    ]);

    useUiStore.getState().toggleDebugMode();
    useUiStore.getState().setSaveScreenFramesEnabled(true);
    useUiStore.getState().setScreenFrameDumpDirectoryPath(
      '/tmp/livepair/screen-frame-dumps/current-debug-session',
    );
    await useUiStore.getState().initializeDevicePreferences();

    useUiStore.getState().reset();

    expect(useUiStore.getState()).toEqual(
      expect.objectContaining({
        isPanelOpen: true,
        panelView: 'chat',
        isDebugMode: false,
        saveScreenFramesEnabled: false,
        screenFrameDumpDirectoryPath: null,
        inputDeviceOptions: [],
        outputDeviceOptions: [],
      }),
    );
  });

  // --- HDMI / DisplayPort output devices ---

  it('shows all HDMI output numbered variants', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'hdmi-1', kind: 'audiooutput', label: 'HDMI Output 1' }),
      createDevice({ deviceId: 'hdmi-2', kind: 'audiooutput', label: 'HDMI Output 2' }),
      createDevice({ deviceId: 'hdmi-3', kind: 'audiooutput', label: 'HDMI Output 3' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'hdmi-1', label: 'HDMI Output 1' },
      { value: 'hdmi-2', label: 'HDMI Output 2' },
      { value: 'hdmi-3', label: 'HDMI Output 3' },
    ]);
  });

  it('shows all DisplayPort output numbered variants', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'dp-1', kind: 'audiooutput', label: 'DisplayPort Output 1' }),
      createDevice({ deviceId: 'dp-2', kind: 'audiooutput', label: 'DisplayPort Output 2' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'dp-1', label: 'DisplayPort Output 1' },
      { value: 'dp-2', label: 'DisplayPort Output 2' },
    ]);
  });

  it('shows all short-form HDMI numbered variants (label without "Output")', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'hdmi-1', kind: 'audiooutput', label: 'HDMI 1' }),
      createDevice({ deviceId: 'hdmi-2', kind: 'audiooutput', label: 'HDMI 2' }),
      createDevice({ deviceId: 'hdmi-3', kind: 'audiooutput', label: 'HDMI 3' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'hdmi-1', label: 'HDMI 1' },
      { value: 'hdmi-2', label: 'HDMI 2' },
      { value: 'hdmi-3', label: 'HDMI 3' },
    ]);
  });

  it('keeps a single HDMI device that has no number suffix', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'hdmi', kind: 'audiooutput', label: 'HDMI' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'hdmi', label: 'HDMI' },
    ]);
  });

  it('shows all output devices including mixed HDMI, DisplayPort, and other profiles', async () => {
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'headset', kind: 'audiooutput', label: 'Headset' }),
      createDevice({ deviceId: 'handsfree', kind: 'audiooutput', label: 'Handsfree' }),
      createDevice({ deviceId: 'analog', kind: 'audiooutput', label: 'Analog Output' }),
      createDevice({ deviceId: 'spdif', kind: 'audiooutput', label: 'Digital Output (S/PDIF)' }),
      createDevice({ deviceId: 'hdmi-1', kind: 'audiooutput', label: 'HDMI Output 1' }),
      createDevice({ deviceId: 'hdmi-2', kind: 'audiooutput', label: 'HDMI Output 2' }),
      createDevice({ deviceId: 'dp-1', kind: 'audiooutput', label: 'DisplayPort Output 1' }),
      createDevice({ deviceId: 'dp-2', kind: 'audiooutput', label: 'DisplayPort Output 2' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'headset', label: 'Headset' },
      { value: 'handsfree', label: 'Handsfree' },
      { value: 'analog', label: 'Analog Output' },
      { value: 'spdif', label: 'Digital Output (S/PDIF)' },
      { value: 'hdmi-1', label: 'HDMI Output 1' },
      { value: 'hdmi-2', label: 'HDMI Output 2' },
      { value: 'dp-1', label: 'DisplayPort Output 1' },
      { value: 'dp-2', label: 'DisplayPort Output 2' },
    ]);
  });

  it('keeps stored output selection when the selected HDMI device is still present', async () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_DESKTOP_SETTINGS, selectedOutputDeviceId: 'hdmi-2' },
      isReady: true,
    });
    enumerateDevices.mockResolvedValue([
      createDevice({ deviceId: 'hdmi-1', kind: 'audiooutput', label: 'HDMI Output 1' }),
      createDevice({ deviceId: 'hdmi-2', kind: 'audiooutput', label: 'HDMI Output 2' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(window.bridge.updateSettings).not.toHaveBeenCalled();
  });

  it('picks up a reconnected device via a later retry when devicechange fired too early', async () => {
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'hyperx', kind: 'audioinput', label: 'HyperX Mic' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    // Disconnect
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
    ]);
    mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
    await flushAsyncWork();

    expect(useUiStore.getState().inputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
    ]);

    // Reconnect: devicechange fires but the device is not visible until the 1500 ms retry.
    vi.useFakeTimers();
    try {
      const noDevice = [
        createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
        createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      ];
      const withDevice = [
        createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
        createDevice({ deviceId: 'hyperx', kind: 'audioinput', label: 'HyperX Mic' }),
        createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      ];
      // immediate + 500 ms retries still see nothing; 1500 ms retry finds the device
      enumerateDevices
        .mockResolvedValueOnce(noDevice)   // immediate
        .mockResolvedValueOnce(noDevice)   // 500 ms
        .mockResolvedValueOnce(withDevice); // 1500 ms

      mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
      await flushAsyncWork();
      expect(useUiStore.getState().inputDeviceOptions).toEqual([{ value: 'default', label: 'System default' }]);

      await vi.advanceTimersByTimeAsync(500);
      await flushAsyncWork();
      expect(useUiStore.getState().inputDeviceOptions).toEqual([{ value: 'default', label: 'System default' }]);

      await vi.advanceTimersByTimeAsync(1000); // now at 1500 ms
      await flushAsyncWork();
      expect(useUiStore.getState().inputDeviceOptions).toEqual([
        { value: 'default', label: 'System default' },
        { value: 'hyperx', label: 'HyperX Mic' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks up a reconnected device via refreshDevices when the user opens the select', async () => {
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'hyperx', kind: 'audioinput', label: 'HyperX Mic' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    // Device disappears
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
    ]);
    await useUiStore.getState().refreshDevices();
    await flushAsyncWork();
    expect(useUiStore.getState().inputDeviceOptions).toEqual([{ value: 'default', label: 'System default' }]);

    // Device reconnects — user opens the select and refreshDevices picks it up
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'hyperx', kind: 'audioinput', label: 'HyperX Mic' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
    ]);
    await useUiStore.getState().refreshDevices();
    await flushAsyncWork();
    expect(useUiStore.getState().inputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'hyperx', label: 'HyperX Mic' },
    ]);
  });

  it('cancels delayed device retries when the store resets', async () => {
    vi.useFakeTimers();
    try {
      enumerateDevices.mockResolvedValueOnce([
        createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
        createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      ]);

      await useUiStore.getState().initializeDevicePreferences();

      enumerateDevices.mockResolvedValue([
        createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
        createDevice({ deviceId: 'usb-mic', kind: 'audioinput', label: 'USB microphone' }),
        createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      ]);

      mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
      await flushAsyncWork();

      useUiStore.getState().reset();
      await vi.runAllTimersAsync();
      await flushAsyncWork();

      expect(useUiStore.getState().inputDeviceOptions).toEqual([]);
      expect(useUiStore.getState().outputDeviceOptions).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes device labels when the device ids stay the same', async () => {
    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'usb-mic', kind: 'audioinput', label: '' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      createDevice({ deviceId: 'desk-speakers', kind: 'audiooutput', label: '' }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    expect(useUiStore.getState().inputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'usb-mic', label: 'Microphone 1' },
    ]);
    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'desk-speakers', label: 'Speaker 1' },
    ]);

    enumerateDevices.mockResolvedValueOnce([
      createDevice({ deviceId: 'default', kind: 'audioinput', label: 'Default microphone' }),
      createDevice({ deviceId: 'usb-mic', kind: 'audioinput', label: 'USB microphone' }),
      createDevice({ deviceId: 'default', kind: 'audiooutput', label: 'Default speakers' }),
      createDevice({ deviceId: 'desk-speakers', kind: 'audiooutput', label: 'Desk speakers' }),
    ]);

    await useUiStore.getState().refreshDevices();
    await flushAsyncWork();

    expect(useUiStore.getState().inputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'usb-mic', label: 'USB microphone' },
    ]);
    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'desk-speakers', label: 'Desk speakers' },
    ]);
  });

  it('keeps the latest device refresh when devicechange events resolve out of order', async () => {
    enumerateDevices.mockResolvedValueOnce([
      createDevice({
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default microphone',
      }),
      createDevice({
        deviceId: 'default',
        kind: 'audiooutput',
        label: 'Default speakers',
      }),
    ]);

    await useUiStore.getState().initializeDevicePreferences();

    const firstRefresh = createDeferred<MediaDeviceInfo[]>();
    const secondRefresh = createDeferred<MediaDeviceInfo[]>();
    enumerateDevices
      .mockImplementationOnce(() => firstRefresh.promise)
      .mockImplementationOnce(() => secondRefresh.promise);

    mediaDevicesEvents.dispatchEvent(new Event('devicechange'));
    mediaDevicesEvents.dispatchEvent(new Event('devicechange'));

    secondRefresh.resolve([
      createDevice({
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default microphone',
      }),
      createDevice({
        deviceId: 'usb-mic',
        kind: 'audioinput',
        label: 'USB Microphone',
      }),
      createDevice({
        deviceId: 'default',
        kind: 'audiooutput',
        label: 'Default speakers',
      }),
      createDevice({
        deviceId: 'desk-speakers',
        kind: 'audiooutput',
        label: 'Desk Speakers',
      }),
    ]);
    await flushAsyncWork();

    firstRefresh.resolve([
      createDevice({
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default microphone',
      }),
      createDevice({
        deviceId: 'default',
        kind: 'audiooutput',
        label: 'Default speakers',
      }),
    ]);
    await flushAsyncWork();

    expect(useUiStore.getState().inputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'usb-mic', label: 'USB Microphone' },
    ]);
    expect(useUiStore.getState().outputDeviceOptions).toEqual([
      { value: 'default', label: 'System default' },
      { value: 'desk-speakers', label: 'Desk Speakers' },
    ]);
  });
});
