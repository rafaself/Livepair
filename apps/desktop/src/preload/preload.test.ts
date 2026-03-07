// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockExposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
  },
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
}));

describe('preload bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('exposes only the bridge API surface', async () => {
    await import('./preload');

    expect(mockExposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(mockExposeInMainWorld).toHaveBeenCalledWith(
      'bridge',
      expect.objectContaining({
        checkHealth: expect.any(Function),
        requestSessionToken: expect.any(Function),
      }),
    );
  });

  it('maps bridge methods to strict IPC channels', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({ status: 'ok', timestamp: 'now' });
    await bridge.checkHealth();
    expect(mockInvoke).toHaveBeenCalledWith('health:check');

    mockInvoke.mockResolvedValueOnce({
      token: 't',
      expiresAt: 'later',
      isStub: true,
    });
    await bridge.requestSessionToken({ sessionId: 'session-1' });
    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {
      sessionId: 'session-1',
    });
  });

  it('passes explicit empty payload when request has no fields', async () => {
    const { bridge } = await import('./preload');

    mockInvoke.mockResolvedValueOnce({ token: 't', expiresAt: 'later', isStub: true });
    await bridge.requestSessionToken({});

    expect(mockInvoke).toHaveBeenCalledWith('session:requestToken', {});
  });
});
