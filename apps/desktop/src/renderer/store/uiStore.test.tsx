import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { useSessionStore } from './sessionStore';
import { useSettingsStore } from './settingsStore';
import { resetDesktopStores } from './testing';
import { useUiStore } from './uiStore';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();
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
        addEventListener: mediaDevicesEvents.addEventListener.bind(mediaDevicesEvents),
        removeEventListener: mediaDevicesEvents.removeEventListener.bind(mediaDevicesEvents),
      },
    });
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    enumerateDevices.mockReset();
  });

  it('toggles the panel and resets the current view when closing', () => {
    useUiStore.getState().togglePanel();
    expect(useUiStore.getState().isPanelOpen).toBe(true);

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

  it('stores backend drafts independently from persisted settings', async () => {
    useUiStore.getState().initializeSettingsUi({ backendUrl: DEFAULT_DESKTOP_SETTINGS.backendUrl });
    expect(useUiStore.getState().backendUrlDraft).toBe('http://localhost:3000');

    useUiStore.getState().setBackendUrlDraft('https://draft.livepair.dev');
    expect(useUiStore.getState().backendUrlDraft).toBe('https://draft.livepair.dev');
    expect(useSettingsStore.getState().settings.backendUrl).toBe('http://localhost:3000');

    await useSettingsStore.getState().updateSettings({ backendUrl: 'https://api.livepair.dev' });
    expect(useSettingsStore.getState().settings.backendUrl).toBe('https://api.livepair.dev');
    expect(useUiStore.getState().backendUrlDraft).toBe('https://draft.livepair.dev');
  });

  it('keeps runtime assistant state in the session store', () => {
    useSessionStore.getState().setAssistantState('speaking');
    expect(useSessionStore.getState().assistantState).toBe('speaking');
    expect(useUiStore.getState().isDebugMode).toBe(false);

    useUiStore.getState().toggleDebugMode();
    expect(useUiStore.getState().isDebugMode).toBe(true);
    expect(useSessionStore.getState().assistantState).toBe('speaking');
  });

  it('resets transient drafts and device options back to defaults', async () => {
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

    useUiStore.getState().initializeSettingsUi({ backendUrl: DEFAULT_DESKTOP_SETTINGS.backendUrl });
    useUiStore.getState().setBackendUrlDraft('https://draft.livepair.dev');
    useUiStore.getState().setBackendUrlError('bad url');
    useUiStore.getState().toggleDebugMode();
    await useUiStore.getState().initializeDevicePreferences();

    useUiStore.getState().reset();

    expect(useUiStore.getState()).toEqual(
      expect.objectContaining({
        isPanelOpen: false,
        panelView: 'chat',
        isDebugMode: false,
        backendUrlDraft: '',
        backendUrlError: null,
        inputDeviceOptions: [],
        outputDeviceOptions: [],
      }),
    );
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
