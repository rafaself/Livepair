import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScreenCaptureSourceSnapshot } from '../../shared';
import { resetDesktopStores } from '../test/store';
import { useSessionStore } from '../store/sessionStore';
import { useUiStore } from '../store/uiStore';
import {
  selectDomainRuntimeSessionSnapshot,
  useDomainRuntimeConversationSnapshot,
  useDomainRuntimeCommands,
  useDomainRuntimeHostState,
} from './domainRuntimeContract';

describe('selectDomainRuntimeSessionSnapshot', () => {
  it('freezes a host-facing session snapshot without transport-facing fields', () => {
    const snapshot = selectDomainRuntimeSessionSnapshot({
      assistantState: 'listening',
      backendState: 'connected',
      backendIndicatorState: 'ready',
      backendLabel: 'Connected',
      currentMode: 'speech',
      tokenRequestState: 'success',
      tokenFeedback: 'Token received',
      textSessionStatus: 'ready',
      textSessionStatusLabel: 'Typed input ready',
      canSubmitText: true,
      lastRuntimeError: null,
      isSessionActive: true,
      isVoiceSessionActive: true,
      liveSessionPhaseLabel: null,
      speechLifecycleStatus: 'listening',
      voiceSessionResumptionStatus: 'connected',
      canEndSpeechMode: true,
      composerSpeechActionKind: 'end',
      localUserSpeechActive: false,
      canToggleScreenContext: true,
      isScreenCaptureActive: true,
      controlGatingSnapshot: {
        canEndSpeechMode: true,
        canSubmitComposerText: true,
        canToggleMicrophone: true,
        canToggleScreenContext: true,
      },
      voiceCaptureState: 'inactive',
      screenCaptureState: 'capturing',
    } as never);

    expect(snapshot.sessionActionKind).toBe('end');
    expect(snapshot.canToggleContextSharing).toBe(true);
    expect(snapshot.isContextSharingActive).toBe(true);
    expect(snapshot.contextState).toBe('active');
    expect(snapshot.controlGatingSnapshot).toEqual(expect.any(Object));
    expect(snapshot.voiceCaptureState).toBe('inactive');
    expect(snapshot.screenCaptureState).toBe('capturing');
    expect('activeTransport' in snapshot).toBe(false);
    expect('screenCaptureSources' in snapshot).toBe(false);
  });
});

describe('useDomainRuntimeConversationSnapshot', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('does not rerender for unrelated session state changes', () => {
    const onRender = vi.fn();

    const { result } = renderHook(() => {
      const snapshot = useDomainRuntimeConversationSnapshot();
      onRender();
      return snapshot;
    });

    const initialRenderCount = onRender.mock.calls.length;

    act(() => {
      useSessionStore.getState().setCurrentMode('speech');
    });

    expect(onRender.mock.calls.length).toBe(initialRenderCount);
    expect(result.current.isConversationEmpty).toBe(true);
  });
});

describe('useDomainRuntimeHostState', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('exposes host-managed screen-source and frame-dump state', () => {
    useSessionStore.getState().setScreenCaptureSourceSnapshot({
      sources: [
        { id: 'screen:1:0', kind: 'screen', name: 'Entire Screen', displayId: '1' },
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      },
    });
    useUiStore.getState().setSaveScreenFramesEnabled(true);
    useUiStore.getState().setScreenFrameDumpDirectoryPath('/tmp/livepair');

    const { result } = renderHook(() => useDomainRuntimeHostState());

    expect(result.current.screenCaptureSources).toHaveLength(1);
    expect(result.current.selectedScreenCaptureSourceId).toBe('screen:1:0');
    expect(result.current.saveScreenFramesEnabled).toBe(true);
    expect(result.current.screenFrameDumpDirectoryPath).toBe('/tmp/livepair');
  });
});

describe('useDomainRuntimeCommands', () => {
  beforeEach(() => {
    resetDesktopStores();
    vi.clearAllMocks();
  });

  it('refreshes and selects screen capture sources through the host boundary', async () => {
    const initialSnapshot: ScreenCaptureSourceSnapshot = {
      sources: [
        { id: 'screen:1:0', kind: 'screen', name: 'Entire Screen', displayId: '1' },
      ],
      selectedSourceId: 'screen:1:0',
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      },
    };
    const selectedSnapshot = (sourceId: string | null): ScreenCaptureSourceSnapshot => ({
      sources: [
        { id: 'screen:1:0', kind: 'screen', name: 'Entire Screen', displayId: '1' },
        { id: 'window:42:0', kind: 'window', name: 'VSCode' },
      ],
      selectedSourceId: sourceId,
      overlayDisplay: {
        displayId: '1',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        workArea: { x: 0, y: 0, width: 100, height: 100 },
        scaleFactor: 1,
      },
    });
    window.bridge.listScreenCaptureSources = vi.fn(async () => initialSnapshot);
    window.bridge.selectScreenCaptureSource = vi.fn(async (sourceId) => selectedSnapshot(sourceId));

    const { result } = renderHook(() => useDomainRuntimeCommands());

    await act(async () => {
      await result.current.refreshScreenCaptureSources();
    });

    expect(useSessionStore.getState().screenCaptureSources).toHaveLength(1);

    await act(async () => {
      await result.current.selectScreenCaptureSource('window:42:0');
    });

    expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBe('window:42:0');

    act(() => {
      result.current.setSaveScreenFramesEnabled(true);
    });

    expect(useUiStore.getState().saveScreenFramesEnabled).toBe(true);
  });
});
