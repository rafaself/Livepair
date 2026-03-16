import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../../store/sessionStore';
import { resetDesktopStores } from '../../../test/store';
import { useAssistantPanelConversationState } from './useAssistantPanelConversationState';

describe('useAssistantPanelConversationState', () => {
  beforeEach(() => {
    resetDesktopStores();
  });

  it('derives visible conversation turns from canonical turns and all transcript artifacts', () => {
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

    // Canonical turns hidden when a transcript artifact covers them.
    // All transcript artifacts are visible regardless of attachedTurnId.
    expect(result.current.conversationTurns.map((entry) => entry.id)).toEqual([
      'user-turn-1',
      'assistant-transcript-1',
      'assistant-transcript-2',
    ]);
    expect(result.current.isConversationEmpty).toBe(false);
  });
});
