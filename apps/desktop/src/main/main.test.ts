// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandle = vi.fn();
const mockAppOn = vi.fn();
const mockWhenReady = vi.fn(() => Promise.resolve());
const mockQuit = vi.fn();
const mockLoadURL = vi.fn();
const mockSetIgnoreMouseEvents = vi.fn();
const mockSetShape = vi.fn();
const mockWindowOn = vi.fn();
const mockGetAllWindows = vi.fn((): unknown[] => []);
const mockAppendSwitch = vi.fn();
const mockWebContentsOn = vi.fn();
const mockGetPath = vi.fn(() => join(tmpdir(), 'livepair-main-tests'));

const browserWindowCtor = vi.fn(() => ({
  loadURL: mockLoadURL,
  loadFile: vi.fn(),
  webContents: {
    openDevTools: vi.fn(),
    toggleDevTools: vi.fn(),
    on: mockWebContentsOn,
  },
  setIgnoreMouseEvents: mockSetIgnoreMouseEvents,
  setShape: mockSetShape,
  on: mockWindowOn,
}));

const mockGetPrimaryDisplay = vi.fn(() => ({
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));

const mockSetDisplayMediaRequestHandler = vi.fn();

vi.mock('electron', () => ({
  app: {
    whenReady: mockWhenReady,
    on: mockAppOn,
    quit: mockQuit,
    getPath: mockGetPath,
    commandLine: { appendSwitch: mockAppendSwitch },
  },
  desktopCapturer: { getSources: vi.fn(async () => []) },
  ipcMain: { handle: mockHandle },
  BrowserWindow: Object.assign(browserWindowCtor, {
    getAllWindows: mockGetAllWindows,
  }),
  screen: { getPrimaryDisplay: mockGetPrimaryDisplay },
  session: {
    defaultSession: {
      setDisplayMediaRequestHandler: mockSetDisplayMediaRequestHandler,
    },
  },
}));

describe('main process runtime', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('registers ipc handlers and lifecycle listeners on startup', async () => {
    await import('./main');

    expect(mockWhenReady).toHaveBeenCalledTimes(1);
    expect(mockHandle).toHaveBeenCalledTimes(20);
    expect(mockGetPath).toHaveBeenCalledWith('userData');
    expect(mockAppOn).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });

  it('creates the overlay window when the app becomes ready', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await import('./main');
    await Promise.resolve();

    expect(mockGetPrimaryDisplay).toHaveBeenCalled();
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);
    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173');
  });

  it('registers the display media handler before creating the window', async () => {
    await import('./main');
    await Promise.resolve();

    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledOnce();
    expect(mockSetDisplayMediaRequestHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('routes activate and window-all-closed callbacks through the overlay helpers', async () => {
    await import('./main');
    await Promise.resolve();

    const activateHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'activate',
    )?.[1] as () => void;
    const windowAllClosedHandler = mockAppOn.mock.calls.find(
      ([event]) => event === 'window-all-closed',
    )?.[1] as () => void;

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([]);
    activateHandler();
    expect(browserWindowCtor).toHaveBeenCalledTimes(1);

    browserWindowCtor.mockClear();
    mockGetAllWindows.mockReturnValueOnce([{}]);
    activateHandler();
    expect(browserWindowCtor).not.toHaveBeenCalled();

    mockQuit.mockClear();
    windowAllClosedHandler();
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });
});
