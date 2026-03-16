import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../../store/sessionStore';
import { resetDesktopStores } from '../../../test/store';
import { useAssistantPanelConversationState } from './useAssistantPanelConversationState';

describe('useAssistantPanelConversationState', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('keeps non-redundant canonical turns visible alongside transcript artifacts', () => {
    const { result } = renderHook(() => useAssistantPanelConversationState());

    act(() => {
      useSessionStore.getState().appendConversationTurn({
        id: 'user-turn-1',
        role: 'user',
        content: 'hello',
        timestamp: '10:00 AM',
        timelineOrdinal: 1,
      });
      useSessionStore.getState().appendConversationTurn({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'canonical reply',
        timestamp: '10:00 AM',
        timelineOrdinal: 4,
      });
      useSessionStore.getState().appendTranscriptArtifact({
        id: 'assistant-transcript-1',
        kind: 'transcript',
        role: 'assistant',
        content: 'hi there',
        timestamp: '10:00 AM',
        source: 'voice',
        timelineOrdinal: 2,
      });
      useSessionStore.getState().appendTranscriptArtifact({
        id: 'assistant-transcript-2',
        kind: 'transcript',
        role: 'assistant',
        content: 'attached',
        timestamp: '10:01 AM',
        source: 'voice',
        timelineOrdinal: 3,
        attachedTurnId: 'assistant-turn-1',
      });
    });

    // The attached assistant transcript stays visible. Because its text differs
    // from the canonical assistant reply, the canonical turn stays visible too.
    expect(result.current.conversationTurns.map((entry) => entry.id)).toEqual([
      'user-turn-1',
      'assistant-transcript-1',
      'assistant-transcript-2',
      'assistant-turn-1',
    ]);
    expect(result.current.isConversationEmpty).toBe(false);
  });
});
