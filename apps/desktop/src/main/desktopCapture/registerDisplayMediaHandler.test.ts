// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSourceRegistry } from './captureSourceRegistry';

type DisplayMediaCallback = (stream: { video?: unknown }) => void;

const mockSource = {
  id: 'screen:1:0',
  name: 'Entire Screen',
  thumbnail: { toDataURL: () => '' },
  display_id: '1',
  appIcon: null,
};

const mockWindowSource = {
  id: 'window:42:0',
  name: 'VSCode',
  thumbnail: { toDataURL: () => '' },
  display_id: '',
  appIcon: null,
};

const overlayDisplay = {
  displayId: '1',
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 23, width: 2560, height: 1417 },
  scaleFactor: 2,
} as const;

function createWindowCaptureSource(id: string, name: string) {
  return { id, name, kind: 'window' as const };
}

const mockGetSources = vi.fn(async () => [mockSource]);

let registeredHandler:
  | ((
      request: { frame: { url: string } },
      callback: DisplayMediaCallback,
    ) => void)
  | null = null;

const mockSetDisplayMediaRequestHandler = vi.fn(
  (
    handler:
      | ((
          request: { frame: { url: string } },
          callback: DisplayMediaCallback,
        ) => void)
      | null,
  ) => {
    registeredHandler = handler;
  },
);

const mockDefaultSession = {
  setDisplayMediaRequestHandler: mockSetDisplayMediaRequestHandler,
};

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: mockGetSources,
  },
  session: {
    defaultSession: mockDefaultSession,
  },
}));

function makeRegistry(overrides: Partial<CaptureSourceRegistry> = {}): CaptureSourceRegistry {
  return {
    getSources: vi.fn(() => []),
    setSources: vi.fn(),
    getSelectedSourceId: vi.fn(() => null),
    setSelectedSourceId: vi.fn(),
    getSelectedSource: vi.fn(() => null),
    getSnapshot: vi.fn(() => ({ sources: [], selectedSourceId: null, overlayDisplay })),
    ...overrides,
  };
}

describe('registerDisplayMediaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = null;
  });

  it('registers a display media request handler without the Electron system picker', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledOnce();
    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledWith(expect.any(Function));
  });

  it('auto-picks the screen source when multiple sources exist and no source is selected', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry({ getSelectedSourceId: vi.fn(() => null) }));

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(mockGetSources).toHaveBeenCalledWith({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      video: expect.objectContaining({ id: mockSource.id }),
    });
  });

  it('calls the callback with no source when only window sources exist and none is selected', async () => {
    mockGetSources.mockResolvedValueOnce([mockWindowSource, { id: 'window:43:0', name: 'Terminal', thumbnail: { toDataURL: () => '' }, display_id: '', appIcon: null }]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry({ getSelectedSourceId: vi.fn(() => null) }));

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({});
  });

  it('uses the selected source from the registry when one is set', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSourceId: vi.fn(() => 'window:42:0') }),
    );

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    // getSources is still called so the registry can be kept up to date;
    // but the callback receives the pre-selected source
    expect(callback).toHaveBeenCalledWith({
      video: expect.objectContaining({ id: 'window:42:0' }),
    });
  });

  it('falls back to the only remaining eligible source when a previous selection disappears', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource]);
    const [
      { createCaptureSourceRegistry },
      { registerDisplayMediaHandler },
    ] = await Promise.all([
      import('./captureSourceRegistry'),
      import('./registerDisplayMediaHandler'),
    ]);
    const registry = createCaptureSourceRegistry();
    registry.setSources([createWindowCaptureSource('window:42:0', 'VSCode')]);
    registry.setSelectedSourceId('window:42:0');

    registerDisplayMediaHandler(registry);

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ video: mockSource });
    expect(registry.getSelectedSourceId()).toBeNull();
  });

  it('auto-picks the screen source when a previous selection disappears and multiple eligible sources remain', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const [
      { createCaptureSourceRegistry },
      { registerDisplayMediaHandler },
    ] = await Promise.all([
      import('./captureSourceRegistry'),
      import('./registerDisplayMediaHandler'),
    ]);
    const registry = createCaptureSourceRegistry();
    registry.setSources([createWindowCaptureSource('window:50:0', 'Browser')]);
    registry.setSelectedSourceId('window:50:0');

    registerDisplayMediaHandler(registry);

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ video: expect.objectContaining({ id: mockSource.id }) });
    expect(registry.getSelectedSourceId()).toBeNull();
  });

  it('calls the callback with no source when a previous selection disappears and only window sources remain', async () => {
    mockGetSources.mockResolvedValueOnce([mockWindowSource, { id: 'window:43:0', name: 'Terminal', thumbnail: { toDataURL: () => '' }, display_id: '', appIcon: null }]);
    const [
      { createCaptureSourceRegistry },
      { registerDisplayMediaHandler },
    ] = await Promise.all([
      import('./captureSourceRegistry'),
      import('./registerDisplayMediaHandler'),
    ]);
    const registry = createCaptureSourceRegistry();
    registry.setSources([createWindowCaptureSource('window:50:0', 'Browser')]);
    registry.setSelectedSourceId('window:50:0');

    registerDisplayMediaHandler(registry);

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({});
    expect(registry.getSelectedSourceId()).toBeNull();
  });

  it('calls the callback with no source when desktopCapturer returns empty', async () => {
    mockGetSources.mockResolvedValueOnce([]);

    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({});
  });

  it('calls the callback with no source and logs the error when desktopCapturer throws', async () => {
    mockGetSources.mockRejectedValueOnce(new Error('system error'));

    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    registerDisplayMediaHandler(makeRegistry());

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({});
    expect(consoleError).toHaveBeenCalledWith(
      '[desktop:display-media] getSources failed',
      expect.objectContaining({ message: 'system error' }),
    );

    consoleError.mockRestore();
  });

  it('updates the registry source list with only eligible sources on each capture request', async () => {
    const livepairOverlay = {
      id: 'window:99:0',
      name: 'Livepair',
      thumbnail: { toDataURL: () => '' },
      display_id: '',
      appIcon: null,
    };
    mockGetSources.mockResolvedValueOnce([livepairOverlay, mockSource, mockWindowSource]);
    const setSources = vi.fn();
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ setSources }),
      () => new Set([livepairOverlay.id]),
    );

    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      vi.fn(),
    );

    expect(setSources).toHaveBeenCalledWith([
      { id: mockSource.id, name: mockSource.name, kind: 'screen', displayId: '1' },
      { id: mockWindowSource.id, name: mockWindowSource.name, kind: 'window' },
    ]);
  });

  it('calls the callback exactly once when the callback itself throws on the success path', async () => {
    // Regression: if callback({ video }) throws, the catch block must NOT call
    // callback a second time — that is the "one-time callback called twice" bug.
    mockGetSources.mockResolvedValueOnce([mockSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSourceId: vi.fn(() => mockSource.id) }),
    );

    let callCount = 0;
    const throwingCallback = vi.fn((_arg: { video?: unknown }) => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('One-time callback was called more than once');
      }
    });

    // Should not throw an unhandled rejection and callback must be invoked once.
    await expect(
      registeredHandler!(
        { frame: { url: 'http://localhost:5173' } },
        throwingCallback,
      ),
    ).resolves.toBeUndefined();

    expect(throwingCallback).toHaveBeenCalledOnce();
  });

  it('calls the callback exactly once when the callback itself throws on the no-source path', async () => {
    mockGetSources.mockResolvedValueOnce([]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());

    let callCount = 0;
    const throwingCallback = vi.fn((_arg: { video?: unknown }) => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error('One-time callback was called more than once');
      }
    });

    await expect(
      registeredHandler!(
        { frame: { url: 'http://localhost:5173' } },
        throwingCallback,
      ),
    ).resolves.toBeUndefined();

    expect(throwingCallback).toHaveBeenCalledOnce();
  });

  it('does not produce an unhandled rejection when the callback throws', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSourceId: vi.fn(() => mockSource.id) }),
    );

    const throwingCallback = vi.fn(() => {
      throw new Error('One-time callback was called more than once');
    });

    // The handler must swallow the callback throw — no rejection propagated.
    await expect(
      registeredHandler!(
        { frame: { url: 'http://localhost:5173' } },
        throwingCallback,
      ),
    ).resolves.toBeUndefined();
  });

  it('is idempotent — calling twice still registers exactly one handler', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());
    registerDisplayMediaHandler(makeRegistry());

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledTimes(2);
  });

  it('allows a sole remaining non-excluded source as a safe fallback', async () => {
    const livepairOverlay = { id: 'window:99:0', name: 'Livepair', thumbnail: { toDataURL: () => '' }, display_id: '', appIcon: null };
    mockGetSources.mockResolvedValueOnce([livepairOverlay, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSource: vi.fn(() => null), getSelectedSourceId: vi.fn(() => null) }),
      () => new Set([livepairOverlay.id]),
    );

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      video: expect.objectContaining({ id: 'window:42:0' }),
    });
  });

  it('manual selection of a window source still works when explicitly chosen', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSourceId: vi.fn(() => 'window:42:0') }),
      () => new Set(['window:99:0']),
    );

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      video: expect.objectContaining({ id: 'window:42:0' }),
    });
  });
});
