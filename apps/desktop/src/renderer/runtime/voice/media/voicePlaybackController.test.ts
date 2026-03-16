import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoicePlaybackController } from './voicePlaybackController';
import type { AssistantAudioPlaybackObserver } from '../../audio/assistantAudioPlayback';
import { useUiStore } from '../../../store/uiStore';
import { resetDesktopStores } from '../../../test/store';

function createHarness() {
  const setVoicePlaybackState = vi.fn();
  const setVoicePlaybackDiagnostics = vi.fn();
  const setAssistantActivity = vi.fn();
  const setLastRuntimeError = vi.fn();
  const store = {
    getState: () => ({
      setVoicePlaybackState,
      setVoicePlaybackDiagnostics,
      setAssistantActivity,
      setLastRuntimeError,
    }),
  };
  const settingsStore = {
    getState: () => ({
      settings: { selectedOutputDeviceId: 'default' },
    }),
  };

  let capturedObserver: AssistantAudioPlaybackObserver | null = null;
  const mockPlayback = {
    enqueue: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    clearQueue: vi.fn(),
  };
  const createPlayback = vi.fn(
    (observer: AssistantAudioPlaybackObserver, _opts: { selectedOutputDeviceId: string }) => {
      capturedObserver = observer;
      return mockPlayback;
    },
  );

  const ctrl = createVoicePlaybackController(store, settingsStore, createPlayback);

  return {
    ctrl,
    store: { setVoicePlaybackState, setVoicePlaybackDiagnostics, setAssistantActivity, setLastRuntimeError },
    createPlayback,
    mockPlayback,
    getObserver: () => capturedObserver,
  };
}

describe('createVoicePlaybackController', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('isActive returns false initially', () => {
    const { ctrl } = createHarness();
    expect(ctrl.isActive()).toBe(false);
  });

  it('getOrCreate lazily creates playback instance', () => {
    const { ctrl, createPlayback } = createHarness();

    const playback = ctrl.getOrCreate();

    expect(createPlayback).toHaveBeenCalledTimes(1);
    expect(playback).toBeDefined();
    expect(ctrl.isActive()).toBe(true);
  });

  it('getOrCreate returns same instance on subsequent calls', () => {
    const { ctrl, createPlayback } = createHarness();

    const first = ctrl.getOrCreate();
    const second = ctrl.getOrCreate();

    expect(first).toBe(second);
    expect(createPlayback).toHaveBeenCalledTimes(1);
  });

  it('getOrCreate passes selectedOutputDeviceId', () => {
    const { ctrl, createPlayback } = createHarness();

    ctrl.getOrCreate();

    expect(createPlayback).toHaveBeenCalledWith(
      expect.any(Object),
      { selectedOutputDeviceId: 'default' },
    );
  });

  it('getOrCreate updates diagnostics with selectedOutputDeviceId', () => {
    const { ctrl, store } = createHarness();

    ctrl.getOrCreate();

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({
      selectedOutputDeviceId: 'default',
    });
  });

  it('setState sets playing state and derives speaking activity', () => {
    const { ctrl, store } = createHarness();

    ctrl.setState('playing');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('playing');
    expect(store.setAssistantActivity).toHaveBeenCalledWith('speaking');
  });

  it('setState sets buffering state and derives speaking activity', () => {
    const { ctrl, store } = createHarness();

    ctrl.setState('buffering');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('buffering');
    expect(store.setAssistantActivity).toHaveBeenCalledWith('speaking');
  });

  it('setState sets stopped state and derives idle activity', () => {
    const { ctrl, store } = createHarness();

    ctrl.setState('stopped');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('stopped');
    expect(store.setAssistantActivity).toHaveBeenCalledWith('idle');
  });

  it('setState sets error state and derives idle activity', () => {
    const { ctrl, store } = createHarness();

    ctrl.setState('error');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('error');
    expect(store.setAssistantActivity).toHaveBeenCalledWith('idle');
  });

  it('stop with active playback calls stop on instance', async () => {
    const { ctrl, mockPlayback } = createHarness();

    ctrl.getOrCreate();
    await ctrl.stop();

    expect(mockPlayback.stop).toHaveBeenCalled();
    expect(ctrl.isActive()).toBe(false);
  });

  it('stop transitions through stopping state', async () => {
    const { ctrl, store } = createHarness();

    ctrl.getOrCreate();
    await ctrl.stop();

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('stopping');
    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('stopped');
  });

  it('stop resets queue depth', async () => {
    const { ctrl, store } = createHarness();

    ctrl.getOrCreate();
    await ctrl.stop();

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({ queueDepth: 0 });
  });

  it('stop without active playback still sets state', async () => {
    const { ctrl, store } = createHarness();

    await ctrl.stop('idle');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('idle');
    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({ queueDepth: 0 });
  });

  it('stop with custom nextState', async () => {
    const { ctrl, store } = createHarness();

    ctrl.getOrCreate();
    await ctrl.stop('error');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('error');
  });

  it('release nullifies instance without stopping', () => {
    const { ctrl, mockPlayback } = createHarness();

    ctrl.getOrCreate();
    ctrl.release();

    expect(ctrl.isActive()).toBe(false);
    expect(mockPlayback.stop).not.toHaveBeenCalled();
  });

  it('observer onStateChange updates state', () => {
    const { ctrl, store, getObserver } = createHarness();

    ctrl.getOrCreate();
    getObserver()!.onStateChange('playing');

    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('playing');
  });

  it('observer onDiagnostics updates diagnostics when debug mode is enabled', () => {
    useUiStore.setState({ isDebugMode: true });
    const { ctrl, store, getObserver } = createHarness();

    ctrl.getOrCreate();
    store.setVoicePlaybackDiagnostics.mockClear();
    getObserver()!.onDiagnostics({ chunkCount: 5 });

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({ chunkCount: 5 });
  });

  it('suppresses hot playback diagnostics when debug mode is off', () => {
    const { ctrl, store, getObserver } = createHarness();

    ctrl.getOrCreate();
    store.setVoicePlaybackDiagnostics.mockClear();

    getObserver()!.onDiagnostics({ chunkCount: 5, queueDepth: 1 });

    expect(store.setVoicePlaybackDiagnostics).not.toHaveBeenCalled();
  });

  it('publishes hot playback diagnostics when debug mode is enabled', () => {
    useUiStore.setState({ isDebugMode: true });
    const { ctrl, store, getObserver } = createHarness();

    ctrl.getOrCreate();
    store.setVoicePlaybackDiagnostics.mockClear();

    getObserver()!.onDiagnostics({ chunkCount: 5, queueDepth: 1 });

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({
      chunkCount: 5,
      queueDepth: 1,
    });
  });

  it('observer onError sets error state and runtime error', () => {
    const { ctrl, store, getObserver } = createHarness();

    ctrl.getOrCreate();
    getObserver()!.onError('audio decode failed');

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({
      lastError: 'audio decode failed',
    });
    expect(store.setVoicePlaybackState).toHaveBeenCalledWith('error');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith('audio decode failed');
  });

  it('updateDiagnostics delegates to store', () => {
    const { ctrl, store } = createHarness();

    ctrl.updateDiagnostics({ sampleRateHz: 24000 });

    expect(store.setVoicePlaybackDiagnostics).toHaveBeenCalledWith({ sampleRateHz: 24000 });
  });
});
