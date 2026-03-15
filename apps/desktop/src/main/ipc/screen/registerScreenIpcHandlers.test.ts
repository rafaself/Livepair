// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../../shared';
import {
  createCaptureSourceRegistry,
  CAPTURE_SOURCE_LIST_OPTIONS,
} from '../../desktopCapture/captureSourceRegistry';
import type { ScreenFrameDumpService } from '../../debug/screenFrameDumpService';

const mockHandle = vi.fn();
const mockGetSources = vi.fn();
const mockGetMediaAccessStatus = vi.fn();
const mockGetPrimaryDisplay = vi.fn(() => ({
  id: 1,
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
  workArea: { x: 0, y: 23, width: 2560, height: 1417 },
  scaleFactor: 2,
}));

vi.mock('electron', () => ({
  desktopCapturer: { getSources: mockGetSources },
  ipcMain: { handle: mockHandle },
  screen: { getPrimaryDisplay: mockGetPrimaryDisplay },
  systemPreferences: { getMediaAccessStatus: mockGetMediaAccessStatus },
}));

function createScreenFrameDumpServiceDouble(): ScreenFrameDumpService {
  return {
    startSession: vi.fn(async () => ({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    })),
    saveFrame: vi.fn(async () => undefined),
  };
}

describe('registerScreenIpcHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    mockHandle.mockReset();
    mockGetSources.mockReset();
    mockGetMediaAccessStatus.mockReset();
    mockGetPrimaryDisplay.mockClear();
  });

  it('registers screen capture and frame dump IPC channels', async () => {
    const { registerScreenIpcHandlers } = await import('./registerScreenIpcHandlers');

    registerScreenIpcHandlers({
      captureSourceRegistry: createCaptureSourceRegistry(),
      platform: 'darwin',
      screenFrameDumpService: createScreenFrameDumpServiceDouble(),
    });

    expect(mockHandle).toHaveBeenCalledTimes(5);
    expect(mockHandle).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.getScreenCaptureAccessStatus,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.listScreenCaptureSources,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      3,
      IPC_CHANNELS.selectScreenCaptureSource,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      4,
      IPC_CHANNELS.startScreenFrameDumpSession,
      expect.any(Function),
    );
    expect(mockHandle).toHaveBeenNthCalledWith(
      5,
      IPC_CHANNELS.saveScreenFrameDumpFrame,
      expect.any(Function),
    );
  });

  it('lists, selects, clears, and validates capture sources', async () => {
    mockGetSources.mockResolvedValue([
      { id: 'screen:1:0', name: 'Entire Screen', display_id: '1' },
      { id: 'window:42:0', name: 'VSCode', display_id: '' },
      { id: 'window:99:0', name: 'Livepair', display_id: '' },
    ]);
    const { registerScreenIpcHandlers } = await import('./registerScreenIpcHandlers');

    registerScreenIpcHandlers({
      captureSourceRegistry: createCaptureSourceRegistry(),
      getExcludedSourceIds: () => new Set(['window:99:0']),
      platform: 'linux',
      screenFrameDumpService: createScreenFrameDumpServiceDouble(),
    });

    const listSourcesHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.listScreenCaptureSources,
    )?.[1] as () => Promise<unknown>;
    const selectSourceHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.selectScreenCaptureSource,
    )?.[1] as (_event: unknown, sourceId: unknown) => Promise<unknown>;

    await expect(listSourcesHandler()).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
        { id: 'window:42:0', name: 'VSCode', kind: 'window' },
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    await expect(selectSourceHandler({}, 'window:42:0')).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
        { id: 'window:42:0', name: 'VSCode', kind: 'window' },
      ],
      selectedSourceId: 'window:42:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });
    await expect(selectSourceHandler({}, null)).resolves.toEqual({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen', kind: 'screen', displayId: '1' },
        { id: 'window:42:0', name: 'VSCode', kind: 'window' },
      ],
      selectedSourceId: null,
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        workArea: { x: 0, y: 23, width: 2560, height: 1417 },
        scaleFactor: 2,
      },
    });

    await expect(selectSourceHandler({}, 42)).rejects.toThrow(
      'screenCapture:selectSource requires a string or null',
    );
    await expect(selectSourceHandler({}, 'window:missing:0')).rejects.toThrow(
      'Unknown screen capture source id',
    );
    await expect(selectSourceHandler({}, 'window:99:0')).rejects.toThrow(
      'Unknown screen capture source id',
    );

    expect(mockGetSources).toHaveBeenNthCalledWith(1, CAPTURE_SOURCE_LIST_OPTIONS);
    expect(mockGetSources).toHaveBeenNthCalledWith(2, CAPTURE_SOURCE_LIST_OPTIONS);
    expect(mockGetSources).toHaveBeenNthCalledWith(3, CAPTURE_SOURCE_LIST_OPTIONS);
    expect(mockGetSources).toHaveBeenNthCalledWith(4, CAPTURE_SOURCE_LIST_OPTIONS);
    expect(mockGetSources).toHaveBeenNthCalledWith(5, CAPTURE_SOURCE_LIST_OPTIONS);
  });

  it('reports access status and validates screen frame dump payloads', async () => {
    mockGetMediaAccessStatus.mockReturnValueOnce('granted');
    const screenFrameDumpService = createScreenFrameDumpServiceDouble();
    const { registerScreenIpcHandlers } = await import('./registerScreenIpcHandlers');

    registerScreenIpcHandlers({
      captureSourceRegistry: createCaptureSourceRegistry(),
      platform: 'darwin',
      screenFrameDumpService,
    });

    const accessStatusHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getScreenCaptureAccessStatus,
    )?.[1] as () => Promise<unknown>;
    const startSessionHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.startScreenFrameDumpSession,
    )?.[1] as () => Promise<{ directoryPath: string }>;
    const saveFrameHandler = mockHandle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.saveScreenFrameDumpFrame,
    )?.[1] as (_event: unknown, payload: unknown) => Promise<void>;

    await expect(accessStatusHandler()).resolves.toEqual({
      platform: 'darwin',
      permissionStatus: 'granted',
    });
    await expect(startSessionHandler()).resolves.toEqual({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    });

    await expect(
      saveFrameHandler({}, {
        sequence: 0,
        mimeType: 'image/jpeg',
        data: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('Invalid screen frame dump payload');
    expect(screenFrameDumpService.saveFrame).not.toHaveBeenCalled();

    await expect(
      saveFrameHandler({}, {
        sequence: 2,
        mimeType: 'image/jpeg',
        data: new Uint8Array([4, 5, 6]),
      }),
    ).resolves.toBeUndefined();

    expect(screenFrameDumpService.startSession).toHaveBeenCalledTimes(1);
    expect(screenFrameDumpService.saveFrame).toHaveBeenCalledWith({
      sequence: 2,
      mimeType: 'image/jpeg',
      data: new Uint8Array([4, 5, 6]),
    });
  });
});
