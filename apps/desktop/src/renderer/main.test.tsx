import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));

describe('renderer main entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    renderMock.mockClear();
    document.body.innerHTML = '';
  });

  it('throws when root element is missing', async () => {
    await expect(import('./main')).rejects.toThrow('Root element not found');
  });

  it('creates React root and renders App when root exists', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import('./main');

    expect(createRootMock).toHaveBeenCalledWith(
      document.getElementById('root'),
    );
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
