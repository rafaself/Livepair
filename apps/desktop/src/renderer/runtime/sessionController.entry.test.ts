import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopSessionController } from './sessionController';

function createControllerDouble(): DesktopSessionController {
  return {
    checkBackendHealth: vi.fn(async () => undefined),
    startSession: vi.fn(async () => undefined),
    startVoiceCapture: vi.fn(async () => undefined),
    stopVoiceCapture: vi.fn(async () => undefined),
    startScreenCapture: vi.fn(async () => undefined),
    stopScreenCapture: vi.fn(async () => undefined),
    subscribeToVoiceChunks: vi.fn(() => vi.fn()),
    submitTextTurn: vi.fn(async () => false),
    endSpeechMode: vi.fn(async () => undefined),
    endSession: vi.fn(async () => undefined),
    setAssistantState: vi.fn(),
  };
}

describe('sessionController entry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('./session/sessionControllerAssembly');
  });

  it('delegates controller assembly to runtime/session internals', async () => {
    const createSessionControllerAssembly = vi.fn();
    const controller = createControllerDouble();
    const createTransport = vi.fn(() => {
      throw new Error('createTransport should not be called by the thin entry');
    });

    createSessionControllerAssembly.mockReturnValue(controller);
    vi.doMock('./session/sessionControllerAssembly', () => ({
      createSessionControllerAssembly,
    }));

    const { createDesktopSessionController } = await import('./sessionController');
    const result = createDesktopSessionController({ createTransport });

    expect(result).toBe(controller);
    expect(createSessionControllerAssembly).toHaveBeenCalledTimes(1);
    expect(createSessionControllerAssembly).toHaveBeenCalledWith(
      expect.objectContaining({
        logger: expect.objectContaining({
          onSessionEvent: expect.any(Function),
        }),
        checkBackendHealth: expect.any(Function),
        requestSessionToken: expect.any(Function),
        createTransport,
        createVoiceCapture: expect.any(Function),
        createVoicePlayback: expect.any(Function),
        createScreenCapture: expect.any(Function),
        store: expect.any(Function),
        settingsStore: expect.any(Function),
      }),
    );
  });

  it('caches the singleton until reset is called', async () => {
    const createSessionControllerAssembly = vi.fn();
    const firstController = createControllerDouble();
    const secondController = createControllerDouble();

    createSessionControllerAssembly
      .mockReturnValueOnce(firstController)
      .mockReturnValueOnce(secondController);
    vi.doMock('./session/sessionControllerAssembly', () => ({
      createSessionControllerAssembly,
    }));

    const {
      getDesktopSessionController,
      resetDesktopSessionController,
    } = await import('./sessionController');

    const first = getDesktopSessionController();
    const second = getDesktopSessionController();

    expect(first).toBe(firstController);
    expect(second).toBe(firstController);
    expect(createSessionControllerAssembly).toHaveBeenCalledTimes(1);

    resetDesktopSessionController();

    const third = getDesktopSessionController();

    expect(third).toBe(secondController);
    expect(createSessionControllerAssembly).toHaveBeenCalledTimes(2);
  });
});
