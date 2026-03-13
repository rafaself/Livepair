import { describe, expect, it } from 'vitest';
import {
  selectAssistantRuntimeState,
  selectBackendIndicatorState,
  selectBackendLabel,
  selectTokenFeedback,
  selectTextSessionStatus,
  selectTextSessionStatusLabel,
  selectCanSubmitText,
  selectIsConversationEmpty,
  selectIsSessionActive,
} from './selectors';

const lifecycle = (status: string) => ({
  textSessionLifecycle: { status } as never,
});

describe('selectAssistantRuntimeState', () => {
  it('returns error when backendState is failed', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'failed',
        tokenRequestState: 'idle',
        ...lifecycle('idle'),
      }),
    ).toBe('error');
  });

  it('returns error when tokenRequestState is error', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'connected',
        tokenRequestState: 'error',
        ...lifecycle('ready'),
      }),
    ).toBe('error');
  });

  it('returns error when text session is in error', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('error'),
      }),
    ).toBe('error');
  });

  it('returns error when text session is goAway', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('goAway'),
      }),
    ).toBe('error');
  });

  it('returns speaking when assistantActivity is speaking', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'speaking',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('ready'),
      }),
    ).toBe('speaking');
  });

  it('returns listening when assistantActivity is listening', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'listening',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('ready'),
      }),
    ).toBe('listening');
  });

  it.each(['connecting', 'sending', 'receiving', 'generationCompleted', 'interrupted', 'disconnecting'] as const)(
    'returns thinking when text session is %s',
    (status) => {
      expect(
        selectAssistantRuntimeState({
          assistantActivity: 'idle',
          backendState: 'connected',
          tokenRequestState: 'idle',
          ...lifecycle(status),
        }),
      ).toBe('thinking');
    },
  );

  it('returns ready when text session is ready', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('ready'),
      }),
    ).toBe('ready');
  });

  it('returns ready when text session is completed', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'connected',
        tokenRequestState: 'idle',
        ...lifecycle('completed'),
      }),
    ).toBe('ready');
  });

  it('returns thinking when backendState is checking and text idle', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'checking',
        tokenRequestState: 'idle',
        ...lifecycle('idle'),
      }),
    ).toBe('thinking');
  });

  it('returns thinking when tokenRequestState is loading and text idle', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'idle',
        tokenRequestState: 'loading',
        ...lifecycle('idle'),
      }),
    ).toBe('thinking');
  });

  it('returns disconnected as fallback', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'idle',
        backendState: 'idle',
        tokenRequestState: 'idle',
        ...lifecycle('disconnected'),
      }),
    ).toBe('disconnected');
  });

  it('prioritizes error over speaking', () => {
    expect(
      selectAssistantRuntimeState({
        assistantActivity: 'speaking',
        backendState: 'failed',
        tokenRequestState: 'idle',
        ...lifecycle('ready'),
      }),
    ).toBe('error');
  });
});

describe('selectBackendIndicatorState', () => {
  it('maps connected to ready', () => {
    expect(selectBackendIndicatorState({ backendState: 'connected' })).toBe('ready');
  });

  it('maps checking to thinking', () => {
    expect(selectBackendIndicatorState({ backendState: 'checking' })).toBe('thinking');
  });

  it('maps failed to error', () => {
    expect(selectBackendIndicatorState({ backendState: 'failed' })).toBe('error');
  });

  it('maps idle to disconnected', () => {
    expect(selectBackendIndicatorState({ backendState: 'idle' as never })).toBe('disconnected');
  });
});

describe('selectBackendLabel', () => {
  it('returns Connected for connected', () => {
    expect(selectBackendLabel({ backendState: 'connected' })).toBe('Connected');
  });

  it('returns Checking backend... for checking', () => {
    expect(selectBackendLabel({ backendState: 'checking' })).toBe('Checking backend...');
  });

  it('returns Not connected as fallback', () => {
    expect(selectBackendLabel({ backendState: 'failed' })).toBe('Not connected');
  });
});

describe('selectTokenFeedback', () => {
  it('returns Requesting token... for loading', () => {
    expect(selectTokenFeedback({ tokenRequestState: 'loading' })).toBe('Requesting token...');
  });

  it('returns Token received for success', () => {
    expect(selectTokenFeedback({ tokenRequestState: 'success' })).toBe('Token received');
  });

  it('returns Connection failed for error', () => {
    expect(selectTokenFeedback({ tokenRequestState: 'error' })).toBe('Connection failed');
  });

  it('returns null for idle', () => {
    expect(selectTokenFeedback({ tokenRequestState: 'idle' })).toBeNull();
  });
});

describe('selectTextSessionStatus', () => {
  it('extracts status from lifecycle', () => {
    expect(selectTextSessionStatus(lifecycle('ready'))).toBe('ready');
  });
});

describe('selectTextSessionStatusLabel', () => {
  it.each([
    ['connecting', 'Preparing typed input...'],
    ['ready', 'Typed input ready'],
    ['sending', 'Sending typed input...'],
    ['receiving', 'Receiving response...'],
    ['generationCompleted', 'Response generated, waiting for turn completion...'],
    ['completed', 'Response complete'],
    ['interrupted', 'Response interrupted'],
    ['goAway', 'Typed input unavailable. Send again to retry.'],
    ['disconnecting', 'Ending typed input...'],
    ['error', 'Typed input failed'],
    ['idle', 'Typed input unavailable'],
    ['disconnected', 'Typed input unavailable'],
  ])('maps %s to "%s"', (status, label) => {
    expect(selectTextSessionStatusLabel(lifecycle(status))).toBe(label);
  });
});

describe('selectCanSubmitText', () => {
  it.each(['ready', 'completed', 'idle', 'disconnected', 'error', 'goAway'] as const)(
    'returns true for %s',
    (status) => {
      expect(selectCanSubmitText(lifecycle(status))).toBe(true);
    },
  );

  it.each(['connecting', 'sending', 'receiving', 'generationCompleted', 'interrupted', 'disconnecting'] as const)(
    'returns false for %s (turn in flight)',
    (status) => {
      expect(selectCanSubmitText(lifecycle(status))).toBe(false);
    },
  );
});

describe('selectIsConversationEmpty', () => {
  it('returns true for empty turns', () => {
    expect(selectIsConversationEmpty({ conversationTurns: [], transcriptArtifacts: [] })).toBe(true);
  });

  it('returns false for non-empty turns', () => {
    expect(
      selectIsConversationEmpty({
        conversationTurns: [{ role: 'user' }] as never,
        transcriptArtifacts: [],
      }),
    ).toBe(false);
  });

  it('returns false when only an unattached transcript artifact is visible', () => {
    expect(
      selectIsConversationEmpty({
        conversationTurns: [],
        transcriptArtifacts: [{ role: 'assistant' }] as never,
      }),
    ).toBe(false);
  });
});

describe('selectIsSessionActive', () => {
  it.each(['connecting', 'ready', 'sending', 'receiving', 'generationCompleted', 'completed', 'interrupted', 'disconnecting'] as const)(
    'returns true for %s',
    (status) => {
      expect(selectIsSessionActive(lifecycle(status))).toBe(true);
    },
  );

  it.each(['idle', 'disconnected', 'goAway', 'error'] as const)(
    'returns false for %s',
    (status) => {
      expect(selectIsSessionActive(lifecycle(status))).toBe(false);
    },
  );
});
