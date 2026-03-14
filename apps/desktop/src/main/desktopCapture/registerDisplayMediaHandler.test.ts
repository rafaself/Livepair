// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSourceRegistry } from './captureSourceRegistry';

type DisplayMediaCallback = (stream: { video: unknown }) => void;

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
    getSnapshot: vi.fn(() => ({ sources: [], selectedSourceId: null })),
    ...overrides,
  };
}

describe('registerDisplayMediaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = null;
  });

  it('registers a display media request handler on the default session', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledOnce();
    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('provides the first screen+window source to the callback when no source is selected', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry({ getSelectedSource: vi.fn(() => null) }));

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(mockGetSources).toHaveBeenCalledWith({
      types: ['screen', 'window'],
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      video: mockSource,
    });
  });

  it('uses the selected source from the registry when one is set', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSource: vi.fn(() => ({ id: 'window:42:0', name: 'VSCode' })) }),
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

  it('falls back to the first source when the selected source id is no longer present', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource]);
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    // Registry says a window source is selected but getSources no longer returns it
    registerDisplayMediaHandler(
      makeRegistry({ getSelectedSource: vi.fn(() => null) }),
    );

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({ video: mockSource });
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

  it('calls the callback with no source when desktopCapturer throws', async () => {
    mockGetSources.mockRejectedValueOnce(new Error('system error'));

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

  it('updates the registry source list on each capture request', async () => {
    mockGetSources.mockResolvedValueOnce([mockSource, mockWindowSource]);
    const setSources = vi.fn();
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry({ setSources }));

    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      vi.fn(),
    );

    expect(setSources).toHaveBeenCalledWith([
      { id: mockSource.id, name: mockSource.name },
      { id: mockWindowSource.id, name: mockWindowSource.name },
    ]);
  });

  it('is idempotent — calling twice still registers exactly one handler', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler(makeRegistry());
    registerDisplayMediaHandler(makeRegistry());

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledTimes(2);
  });
});
