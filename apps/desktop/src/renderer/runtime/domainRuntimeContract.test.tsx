import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDesktopStores } from '../test/store';
import { useSessionStore } from '../store/sessionStore';
import {
  selectDomainRuntimeSessionSnapshot,
  useDomainRuntimeConversationSnapshot,
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
      liveSessionPhaseLabel: null,
      speechLifecycleStatus: 'listening',
      voiceSessionResumptionStatus: 'connected',
      canEndSpeechMode: true,
      composerSpeechActionKind: 'end',
      localUserSpeechActive: false,
      canToggleScreenContext: true,
      isScreenCaptureActive: true,
      screenCaptureState: 'capturing',
    } as never);

    expect(snapshot.sessionActionKind).toBe('end');
    expect(snapshot.canToggleContextSharing).toBe(true);
    expect(snapshot.isContextSharingActive).toBe(true);
    expect(snapshot.contextState).toBe('active');
    expect('activeTransport' in snapshot).toBe(false);
    expect('voiceCaptureState' in snapshot).toBe(false);
    expect('screenCaptureState' in snapshot).toBe(false);
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
