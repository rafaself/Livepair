import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
const bootstrapDesktopRendererMock = vi.fn();
const consoleErrorMock = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

vi.mock('./bootstrap', () => ({
  bootstrapDesktopRenderer: bootstrapDesktopRendererMock,
}));

describe('renderer main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    renderMock.mockClear();
    consoleErrorMock.mockClear();
    bootstrapDesktopRendererMock.mockReset();
    bootstrapDesktopRendererMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
    document.body.innerHTML = '';
  });

  it('throws when root element is missing', async () => {
    await expect(import('./main')).rejects.toThrow('Root element not found');
  });

  it('creates React root and renders App when root exists', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main');

    expect(bootstrapDesktopRendererMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root'),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('renders App before bootstrap settles', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    bootstrapDesktopRendererMock.mockImplementation(
      () => new Promise<void>(() => undefined),
    );

    await import('./main');

    expect(bootstrapDesktopRendererMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root'),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it('still mounts the app when bootstrap fails', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    bootstrapDesktopRendererMock.mockRejectedValue(new Error('boom'));

    await import('./main');
    await Promise.resolve();

    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root'),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock).toHaveBeenCalledWith(
      'Failed to bootstrap desktop renderer',
      expect.any(Error),
    );
  });
});
