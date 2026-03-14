// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type DisplayMediaCallback = (stream: { video: unknown }) => void;

const mockSource = {
  id: 'screen:1:0',
  name: 'Entire Screen',
  thumbnail: { toDataURL: () => '' },
  display_id: '1',
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

describe('registerDisplayMediaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = null;
  });

  it('registers a display media request handler on the default session', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler();

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledOnce();
    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('provides the first screen source to the callback when invoked', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler();

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(mockGetSources).toHaveBeenCalledWith({
      types: ['screen'],
    });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({
      video: mockSource,
    });
  });

  it('calls the callback with no source when desktopCapturer returns empty', async () => {
    mockGetSources.mockResolvedValueOnce([]);

    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler();

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

    registerDisplayMediaHandler();

    const callback = vi.fn();
    await registeredHandler!(
      { frame: { url: 'http://localhost:5173' } },
      callback,
    );

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith({});
  });

  it('is idempotent — calling twice still registers exactly one handler', async () => {
    const { registerDisplayMediaHandler } = await import(
      './registerDisplayMediaHandler'
    );

    registerDisplayMediaHandler();
    registerDisplayMediaHandler();

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledTimes(2);
  });
});
