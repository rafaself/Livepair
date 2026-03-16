import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceCaptureBinding } from './voiceCaptureBinding';
import { useUiStore } from '../../../store/uiStore';
import { resetDesktopStores } from '../../../test/store';

function createHarness() {
  const setVoiceCaptureState = vi.fn();
  const setLocalUserSpeechActive = vi.fn();
  const setVoiceSessionStatus = vi.fn();
  const setLastRuntimeError = vi.fn();
  const setVoiceCaptureDiagnostics = vi.fn();
  const storeState = {
    setVoiceCaptureState,
    setLocalUserSpeechActive,
    setVoiceSessionStatus,
    setLastRuntimeError,
    setVoiceCaptureDiagnostics,
  };
  const voiceCapture = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const createVoiceCapture = vi.fn().mockReturnValue(voiceCapture);
  const enqueueChunkSend = vi.fn().mockResolvedValue(undefined);

  const binding = createVoiceCaptureBinding(
    {
      store: { getState: () => storeState } as never,
      createVoiceCapture,
      getActiveTransport: vi.fn().mockReturnValue({ kind: 'gemini-live' }),
      currentVoiceSessionStatus: vi.fn().mockReturnValue('streaming'),
      getRealtimeOutboundGateway: vi.fn(),
      settingsStore: vi.fn(),
      setVoiceSessionStatus: vi.fn(),
      setVoiceErrorState: vi.fn(),
      logRuntimeError: vi.fn(),
    } as never,
    enqueueChunkSend,
  );

  binding.getVoiceCapture();
  const observer = createVoiceCapture.mock.calls[0]?.[0];

  return {
    observer,
    enqueueChunkSend,
    store: {
      setVoiceCaptureState,
      setLocalUserSpeechActive,
      setVoiceSessionStatus,
      setLastRuntimeError,
      setVoiceCaptureDiagnostics,
    },
  };
}

describe('createVoiceCaptureBinding', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('suppresses hot capture diagnostics when debug mode is off', () => {
    const { observer, store } = createHarness();

    observer.onDiagnostics({ chunkCount: 4, bytesPerChunk: 640 });

    expect(store.setVoiceCaptureDiagnostics).not.toHaveBeenCalled();
  });

  it('publishes hot capture diagnostics when debug mode is enabled', () => {
    useUiStore.setState({ isDebugMode: true });
    const { observer, store } = createHarness();

    observer.onDiagnostics({ chunkCount: 4, bytesPerChunk: 640 });

    expect(store.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
      chunkCount: 4,
      bytesPerChunk: 640,
    });
  });

  it('still surfaces capture errors even when debug mode is off', () => {
    const { observer, store } = createHarness();

    observer.onError('Permission denied');

    expect(store.setVoiceCaptureState).toHaveBeenCalledWith('error');
    expect(store.setLocalUserSpeechActive).toHaveBeenCalledWith(false);
    expect(store.setVoiceSessionStatus).toHaveBeenCalledWith('ready');
    expect(store.setLastRuntimeError).toHaveBeenCalledWith('Permission denied');
    expect(store.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
      lastError: 'Permission denied',
    });
  });
});
