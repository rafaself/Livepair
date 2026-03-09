import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { useSessionStore } from './sessionStore';
import { useSettingsStore } from './settingsStore';
import { resetDesktopStores } from './testing';
import { useUiStore } from './uiStore';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();

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
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
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
      {
        deviceId: 'default',
        groupId: 'group-input',
        kind: 'audioinput',
        label: 'Default microphone',
        toJSON: () => ({}),
      } satisfies MediaDeviceInfo,
      {
        deviceId: 'default',
        groupId: 'group-output',
        kind: 'audiooutput',
        label: 'Default speakers',
        toJSON: () => ({}),
      } satisfies MediaDeviceInfo,
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
});
