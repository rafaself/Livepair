import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();

function AssistantPanelHarness({
  showStateDevControls = false,
}: {
  showStateDevControls?: boolean;
}): JSX.Element {
  const togglePanel = useUiStore((state) => state.togglePanel);
  const { handleStartSession } = useSessionRuntime();

  return (
    <>
      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={() => void handleStartSession()}>
        start session
      </button>
      <AssistantPanel showStateDevControls={showStateDevControls} />
    </>
  );
}

async function renderAssistantPanel(
  props: { showStateDevControls?: boolean } = {},
): Promise<ReturnType<typeof render>> {
  await act(async () => {
    useUiStore.getState().initializeSettingsUi(useSettingsStore.getState().settings);
    await useUiStore.getState().initializeDevicePreferences();
  });

  return render(<AssistantPanelHarness {...props} />);
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        backendUrl: 'https://persisted.livepair.dev',
      },
      isReady: true,
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    vi.clearAllMocks();
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    enumerateDevices.mockReset();
    enumerateDevices.mockResolvedValue([]);
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it('opens settings from the header and shows hydrated values immediately', async () => {
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    expect(await panelScope.findByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://persisted.livepair.dev',
    );
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
  });

  it('preserves config draft state when switching away from settings and back', async () => {
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    const backendUrlInput = await panelScope.findByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, {
        target: { value: 'https://draft.livepair.dev' },
      });
    });

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Chat' }));
    });
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    expect(await panelScope.findByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://draft.livepair.dev',
    );
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
  });

  it('shows developer tools only when enabled', async () => {
    await renderAssistantPanel({ showStateDevControls: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    expect(panelScope.getByRole('button', { name: 'Developer tools' })).toBeVisible();
  });

  it('renders the debug view when developer controls are enabled', async () => {
    await renderAssistantPanel({ showStateDevControls: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Developer tools' }));
    });

    expect(await panelScope.findByRole('heading', { name: 'Developer tools' })).toBeVisible();
  });

  it('hides the debug entry point when developer controls are disabled', async () => {
    await renderAssistantPanel({ showStateDevControls: false });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    expect(panelScope.queryByRole('button', { name: 'Developer tools' })).toBeNull();
  });
});
