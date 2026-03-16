import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatId } from '@livepair/shared-types';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../../shared/settings';
import { useSettingsStore } from '../../../../store/settingsStore';
import { useSessionStore } from '../../../../store/sessionStore';
import { resetDesktopStores } from '../../../../test/store';
import { useUiStore } from '../../../../store/uiStore';
import { useAssistantPanelSettingsController } from './useAssistantPanelSettingsController';

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

function HookHarness(): JSX.Element {
  const controller = useAssistantPanelSettingsController();
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);

  return (
    <div>
      <output aria-label="input-options">
        {controller.inputDeviceOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="output-options">
        {controller.outputDeviceOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="screen-source-options">
        {controller.screenCaptureSourceOptions.map((option) => option.label).join('|')}
      </output>
      <output aria-label="selected-screen-source">{controller.selectedScreenCaptureSourceId}</output>
      <output aria-label="last-runtime-error">{lastRuntimeError ?? 'none'}</output>
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
      <button
        type="button"
        onClick={() => controller.setSelectedScreenCaptureSourceId('window:42:0')}
      >
        set screen source
      </button>
      <button
        type="button"
        onClick={() => controller.setSelectedScreenCaptureSourceId('')}
      >
        reset screen source
      </button>
      <output aria-label="echo-cancellation">{String(controller.voiceEchoCancellationEnabled)}</output>
      <output aria-label="noise-suppression">{String(controller.voiceNoiseSuppressionEnabled)}</output>
      <output aria-label="auto-gain-control">{String(controller.voiceAutoGainControlEnabled)}</output>
      <output aria-label="speech-silence-timeout">{controller.speechSilenceTimeout}</output>
      <output aria-label="screen-context-mode">{controller.screenContextMode}</output>
      <output aria-label="continuous-screen-quality">{controller.continuousScreenQuality}</output>
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
      <button type="button" onClick={() => controller.setSpeechSilenceTimeout('3m')}>
        set speech timeout
      </button>
      <button type="button" onClick={() => controller.setScreenContextMode('manual')}>
        set manual mode
      </button>
      <button type="button" onClick={() => controller.setScreenContextMode('continuous')}>
        set continuous mode
      </button>
      <button type="button" onClick={() => controller.setContinuousScreenQuality('high')}>
        set high automatic quality
      </button>
    </div>
  );
}

describe('useAssistantPanelSettingsController', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: OVERLAY_DISPLAY,
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'screen:1:0',
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
  });

  it('surfaces hydrated device options from the ui store', async () => {
    useUiStore.setState({
      inputDeviceOptions: [
        { value: 'default', label: 'System default' },
        { value: 'usb-mic', label: 'USB Microphone' },
      ],
      outputDeviceOptions: [
        { value: 'default', label: 'System default' },
        { value: 'desk-speakers', label: 'Desk Speakers' },
      ],
    });

    render(<HookHarness />);

    expect(screen.getByLabelText('input-options')).toHaveTextContent(
      'System default|USB Microphone',
    );
    expect(screen.getByLabelText('output-options')).toHaveTextContent(
      'System default|Desk Speakers',
    );
  });

  it('loads screen capture source options and exposes the selected source', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
        'Entire Screen|VSCode',
      );
      expect(screen.getByLabelText('selected-screen-source')).toHaveTextContent('screen:1:0');
    });
  });

  it('shows no options when screen capture sources are unavailable', () => {
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [],
      selectedSourceId: null,
      overlayDisplay: OVERLAY_DISPLAY,
    });

    render(<HookHarness />);

    expect(screen.getByLabelText('screen-source-options')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('selected-screen-source')).toBeEmptyDOMElement();
  });

  it('updates the selected screen capture source from the returned snapshot', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'set screen source' }));

    await waitFor(() => {
      expect(screen.getByLabelText('selected-screen-source')).toHaveTextContent('window:42:0');
    });
  });

  it('surfaces a runtime error when selecting a screen capture source fails', async () => {
    window.bridge.selectScreenCaptureSource = vi.fn(async () => {
      throw new Error('selection failed');
    });

    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'set screen source' }));

    await waitFor(() => {
      expect(screen.getByLabelText('last-runtime-error')).toHaveTextContent('selection failed');
    });
  });

  it('routes settings mutations through the stores and exposes debug mode toggles', async () => {
    render(<HookHarness />);

    expect(screen.getByLabelText('debug-mode')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('button', { name: 'toggle debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'toggle pinned' }));
    fireEvent.click(screen.getByRole('button', { name: 'set fast' }));
    fireEvent.click(screen.getByRole('button', { name: 'set input' }));
    fireEvent.click(screen.getByRole('button', { name: 'set output' }));
    fireEvent.click(screen.getByRole('button', { name: 'set screen source' }));
    fireEvent.click(screen.getByRole('button', { name: 'reset screen source' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable echo cancellation' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable noise suppression' }));
    fireEvent.click(screen.getByRole('button', { name: 'disable auto gain control' }));
    fireEvent.click(screen.getByRole('button', { name: 'set dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'set speech timeout' }));

    await waitFor(() => {
      expect(screen.getByLabelText('debug-mode')).toHaveTextContent('true');
    });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ isPanelPinned: true });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ preferredMode: 'fast' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ selectedInputDeviceId: 'usb-mic' });
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'desk-speakers',
    });
    expect(window.bridge.selectScreenCaptureSource).toHaveBeenCalledWith('window:42:0');
    expect(window.bridge.selectScreenCaptureSource).toHaveBeenCalledWith(null);
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
    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ speechSilenceTimeout: '3m' });
    expect(screen.getByLabelText('speech-silence-timeout')).toHaveTextContent('3m');
  });

  it('exposes the first-use screen context defaults', () => {
    render(<HookHarness />);

    expect(screen.getByLabelText('screen-context-mode')).toHaveTextContent('unconfigured');
    expect(screen.getByLabelText('continuous-screen-quality')).toHaveTextContent('medium');
  });

  it('persists screen context mode and automatic quality changes through the settings store', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'set manual mode' }));

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        screenContextMode: 'manual',
      });
      expect(screen.getByLabelText('screen-context-mode')).toHaveTextContent('manual');
    });

    fireEvent.click(screen.getByRole('button', { name: 'set continuous mode' }));

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        screenContextMode: 'continuous',
      });
      expect(screen.getByLabelText('screen-context-mode')).toHaveTextContent('continuous');
    });

    fireEvent.click(screen.getByRole('button', { name: 'set high automatic quality' }));

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        continuousScreenQuality: 'high',
      });
      expect(screen.getByLabelText('continuous-screen-quality')).toHaveTextContent('high');
    });
  });
});

describe('wave 1: screen-capture source stabilization on chat switch', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: OVERLAY_DISPLAY,
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'screen:1:0',
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
  });

  it('reloads the source list when activeChatId changes after a chat switch', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
        'Entire Screen|VSCode',
      );
    });

    vi.mocked(window.bridge.listScreenCaptureSources).mockClear();

    act(() => {
      useSessionStore.getState().reset({ activeChatId: 'chat-2' as ChatId });
    });

    await waitFor(() => {
      expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
        'Entire Screen|VSCode',
      );
    });
  });

  it('preserves the source selection when the bridge reports the same selection after a chat switch', async () => {
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [
        createScreenSource('screen:1:0', 'Entire Screen', '1'),
        createWindowSource('window:42:0', 'VSCode'),
      ],
      selectedSourceId: 'window:42:0',
      overlayDisplay: OVERLAY_DISPLAY,
    }));

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByLabelText('selected-screen-source')).toHaveTextContent('window:42:0');
    });

    act(() => {
      useSessionStore.getState().reset({ activeChatId: 'chat-2' as ChatId });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('selected-screen-source')).toHaveTextContent('window:42:0');
    });
  });

  it('clears the selection when the bridge reports no selection after a chat switch', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByLabelText('selected-screen-source')).toHaveTextContent('screen:1:0');
    });

    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [createScreenSource('screen:1:0', 'Entire Screen', '1')],
      selectedSourceId: null,
      overlayDisplay: OVERLAY_DISPLAY,
    }));

    act(() => {
      useSessionStore.getState().reset({ activeChatId: 'chat-2' as ChatId });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('selected-screen-source')).toBeEmptyDOMElement();
    });
  });

  it('shows the full source list on the first open after a chat switch without needing to reopen', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent('VSCode');
    });

    act(() => {
      useSessionStore.getState().reset({ activeChatId: 'chat-3' as ChatId });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
        'Entire Screen|VSCode',
      );
    });
  });

  it('loads sources on initial mount regardless of activeChatId', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('screen-source-options')).toHaveTextContent(
        'Entire Screen|VSCode',
      );
    });
  });
});
