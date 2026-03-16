import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import {
  hydrateCurrentChat,
  resetCurrentChatMemoryForTests,
} from '../chatMemory/currentChatMemory';
import { useSessionStore } from '../store/sessionStore';
import { useSettingsStore } from '../store/settingsStore';
import { resetDesktopStoresWithDefaults } from '../test/store';
import {
  createVoicePlaybackHarness,
  createVoiceTransportHarness,
} from './sessionController.testUtils';
import { selectVisibleConversationTimeline } from './selectors';

function buildVoiceController(overrides: Partial<Parameters<typeof createDesktopSessionController>[0]> = {}) {
  const voiceTransport = createVoiceTransportHarness();
  const voicePlayback = createVoicePlaybackHarness();
  const controller = createDesktopSessionController({
    logger: {
      onSessionEvent: vi.fn(),
      onTransportEvent: vi.fn(),
    },
    checkBackendHealth: vi.fn(),
    requestSessionToken: vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    }),
    createTransport: vi.fn(() => voiceTransport.transport),
    createVoicePlayback: voicePlayback.createVoicePlayback,
    settingsStore: useSettingsStore,
    ...overrides,
  });

  return {
    controller,
    voiceTransport,
    voicePlayback,
  };
}

function visibleTimeline() {
  return selectVisibleConversationTimeline(useSessionStore.getState());
}

describe('createDesktopSessionController – transcript', () => {
  beforeEach(() => {
    resetDesktopStoresWithDefaults();
    resetCurrentChatMemoryForTests();
  });

  it('shows the user transcript bubble immediately as speech arrives, before the assistant responds', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });

    // The user bubble should be visible immediately — not held until settlement.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Hello',
        state: 'streaming',
        source: 'voice',
      }),
    ]);

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });

    // Updated transcript should still be visible and reuse the same artifact.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello there',
        state: 'streaming',
        source: 'voice',
      }),
    ]);

    // Once the assistant starts speaking, both bubbles should be visible
    // with user before assistant in chronological order.
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello there',
        state: 'streaming',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Hi',
        state: 'streaming',
        source: 'voice',
      }),
    ]);

    // After settlement the transcript artifacts remain visible as the
    // primary chat history. Canonical turns are created for persistence
    // but hidden from the visible timeline when a transcript covers them.
    voiceTransport.emit({ type: 'turn-complete' });

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello there',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Hi',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('shows both user and assistant transcript artifacts in the timeline during streaming', async () => {
    const { controller, voiceTransport, voicePlayback } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'audio-chunk', chunk: new Uint8Array([1, 2, 3, 4]) });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello there',
        state: 'streaming',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Hi',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'Hello there' },
      assistant: { text: 'Hi' },
    });
    expect(voicePlayback.enqueue).toHaveBeenCalledWith(new Uint8Array([1, 2, 3, 4]));
  });

  it('creates the canonical voice user turn only at the settle fence and shows the next user transcript immediately', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'turn-complete' });

    // Canonical turns are created for backend persistence; transcript
    // artifacts remain in the store with attachedTurnId linking them.
    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Hello there',
        state: 'complete',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hi',
        state: 'complete',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        state: 'complete',
        attachedTurnId: 'assistant-turn-1',
      }),
    ]);
    // The visible timeline shows transcript artifacts; canonical turns are
    // hidden when a transcript artifact covers them.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        content: 'Hello there',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'Hi',
        state: 'complete',
      }),
    ]);

    voiceTransport.emit({ type: 'input-transcript', text: 'Next turn' });

    expect(useSessionStore.getState().currentVoiceTranscript).toEqual({
      user: { text: 'Next turn' },
      assistant: { text: '' },
    });
    // The next user transcript should be visible immediately as a streaming artifact.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        content: 'Hello there',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'Hi',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'user-transcript-3',
        role: 'user',
        content: 'Next turn',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('keeps sequential voice turns progressing when Gemini replays the settled user transcript before the next reply', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'same phrase', isFinal: true });
    voiceTransport.emit({ type: 'output-transcript', text: 'First reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    voiceTransport.emit({ type: 'input-transcript', text: 'same phrase' });
    voiceTransport.emit({ type: 'text-delta', text: 'Second reply' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Second reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'same phrase',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'First reply',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-2',
        role: 'assistant',
        content: 'Second reply',
        source: 'voice',
      }),
    ]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        content: 'same phrase',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'First reply',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-3',
        content: 'Second reply',
      }),
    ]);
  });

  it('preserves the full finalized user utterance when Gemini sends successive input transcript windows', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'primeiro trecho' });
    voiceTransport.emit({ type: 'input-transcript', text: 'segundo trecho' });
    voiceTransport.emit({ type: 'input-transcript', text: 'terceiro trecho', isFinal: true });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'primeiro trecho segundo trecho terceiro trecho',
        source: 'voice',
      }),
    ]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'primeiro trecho segundo trecho terceiro trecho',
        source: 'voice',
      }),
    ]);
  });

  it('keeps apostrophe contractions intact across successive user transcript windows', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'It' });
    voiceTransport.emit({ type: 'input-transcript', text: "'s working", isFinal: true });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: "It's working",
        source: 'voice',
      }),
    ]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        role: 'user',
        content: "It's working",
        source: 'voice',
      }),
    ]);
  });

  it('keeps likely mid-word user continuations attached across transcript windows', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: "Yeah, it's very good tal" });
    voiceTransport.emit({
      type: 'input-transcript',
      text: "king to this app. It's going good.",
      isFinal: true,
    });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        role: 'user',
        content: "Yeah, it's very good talking to this app. It's going good.",
        source: 'voice',
      }),
    ]);
  });

  it('keeps the same in-progress assistant transcript artifact as transcript corrections arrive', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Hi' });
    voiceTransport.emit({ type: 'output-transcript', text: ' there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there, corrected' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there' });

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Hi there, corrected',
        state: 'streaming',
        source: 'voice',
      }),
    ]);
  });

  it('persists the settled assistant transcript on turn-complete when transcript and draft both exist', async () => {
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      answerMetadata?: {
        provenance: 'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified';
        thinkingText?: string;
      };
      createdAt: string;
      sequence: number;
    }> = [];
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({
        chatId,
        role,
        contentText,
        answerMetadata,
      }: {
        chatId: string;
        role: 'user' | 'assistant';
        contentText: string;
        answerMetadata?: {
          provenance: 'project_grounded' | 'web_grounded' | 'tool_grounded' | 'unverified';
          thinkingText?: string;
        };
      }) => {
        const nextRecord = {
          id: `${role}-message-${persistedMessages.length + 1}`,
          chatId,
          role,
          contentText,
          ...(answerMetadata ? { answerMetadata } : {}),
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
    );
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Transcript bubble reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Canonical' });
    voiceTransport.emit({ type: 'text-delta', text: ' reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Transcript bubble reply',
        answerMetadata: {
          provenance: 'unverified',
          thinkingText: 'Canonical reply',
        },
      });
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Transcript bubble reply',
        state: 'complete',
        source: 'voice',
        persistedMessageId: 'assistant-message-1',
        answerMetadata: {
          provenance: 'unverified',
          thinkingText: 'Canonical reply',
        },
      }),
    ]);
    // The transcript artifact remains in the store with attachedTurnId.
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Transcript bubble reply',
        state: 'complete',
        attachedTurnId: 'assistant-turn-1',
      }),
    ]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Transcript bubble reply',
      }),
    ]);

    resetDesktopStoresWithDefaults();
    resetCurrentChatMemoryForTests();

    await hydrateCurrentChat();

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'persisted-message-assistant-message-1',
        role: 'assistant',
        content: 'Transcript bubble reply',
        persistedMessageId: 'assistant-message-1',
        answerMetadata: {
          provenance: 'unverified',
          thinkingText: 'Canonical reply',
        },
      }),
    ]);
  });

  it('falls back to the completed assistant draft when no settled assistant transcript exists', async () => {
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      createdAt: string;
      sequence: number;
    }> = [];
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({
        chatId,
        role,
        contentText,
      }: {
        chatId: string;
        role: 'user' | 'assistant';
        contentText: string;
      }) => {
        const nextRecord = {
          id: `${role}-message-${persistedMessages.length + 1}`,
          chatId,
          role,
          contentText,
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
    );
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'text-delta', text: 'Draft only' });
    voiceTransport.emit({ type: 'text-delta', text: ' reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Draft only reply',
      });
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Draft only reply',
        state: 'complete',
        source: 'voice',
        persistedMessageId: 'assistant-message-1',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Draft only reply',
      }),
    ]);
  });

  it('keeps interrupted assistant transcript output visible without persisting a canonical assistant turn', async () => {
    const persistedMessages: Array<{
      id: string;
      chatId: string;
      role: 'user' | 'assistant';
      contentText: string;
      createdAt: string;
      sequence: number;
    }> = [];
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({
        chatId,
        role,
        contentText,
      }: {
        chatId: string;
        role: 'user' | 'assistant';
        contentText: string;
      }) => {
        const nextRecord = {
          id: `${role}-message-${persistedMessages.length + 1}`,
          chatId,
          role,
          contentText,
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
    );
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Interrupted transcript reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Interrupted canonical reply' });
    voiceTransport.emit({ type: 'interrupted' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Interrupted transcript reply',
        statusLabel: 'Interrupted',
        state: 'complete',
      }),
    ]);
    expect(window.bridge.appendChatMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        contentText: 'Interrupted canonical reply',
      }),
    );
    expect(persistedMessages).toEqual([]);
  });

  it('ignores late assistant packets and duplicate turn-complete after a completed turn is fenced', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'Hello there' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Transcript bubble reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Canonical reply' });
    voiceTransport.emit({ type: 'turn-complete' });
    voiceTransport.emit({ type: 'output-transcript', text: 'late transcript' });
    voiceTransport.emit({ type: 'text-delta', text: 'late canonical' });
    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'Hello there',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Transcript bubble reply',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        state: 'complete',
        attachedTurnId: 'user-turn-1',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        state: 'complete',
        attachedTurnId: 'assistant-turn-1',
      }),
    ]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        content: 'Hello there',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'Transcript bubble reply',
      }),
    ]);
  });

  it('does not finalize a voice turn on generation-complete before turn-complete arrives', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'output-transcript', text: 'Preview reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Canonical preview' });
    voiceTransport.emit({ type: 'generation-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-transcript-1',
        content: 'Preview reply',
        state: 'streaming',
      }),
    ]);

    voiceTransport.emit({ type: 'turn-complete' });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Preview reply',
        state: 'complete',
      }),
    ]);
  });

  it('keeps mixed-mode ordering stable when a typed follow-up lands during active Live mode', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    voiceTransport.emit({ type: 'input-transcript', text: 'spoken request' });
    voiceTransport.emit({ type: 'turn-complete' });

    await controller.submitTextTurn('typed follow-up');

    voiceTransport.emit({ type: 'output-transcript', text: 'typed reply transcript' });
    voiceTransport.emit({ type: 'text-delta', text: 'typed reply canonical' });
    voiceTransport.emit({ type: 'turn-complete' });

    // The spoken request transcript artifact covers the canonical turn.
    // The typed follow-up has no transcript, so the canonical turn is shown.
    // The assistant transcript also covers its canonical persisted turn once
    // the final spoken transcript becomes canonical history.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        content: 'spoken request',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'typed follow-up',
        source: 'text',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        content: 'typed reply transcript',
        source: 'voice',
      }),
    ]);
  });

  it('preserves assistant voice responses in the timeline after ending speech mode', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    // Simulate a completed voice turn: user speaks, assistant replies, turn settles.
    voiceTransport.emit({ type: 'input-transcript', text: 'Hello' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Hi there' });
    voiceTransport.emit({ type: 'turn-complete' });

    // Before ending, verify transcripts remain as visible records.
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Hi there',
        state: 'complete',
        source: 'voice',
      }),
    ]);

    // End speech mode — transcript artifacts must NOT disappear.
    await controller.endSpeechMode();

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Hello',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Hi there',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });

  it('materializes an in-flight assistant transcript as a canonical turn when speech mode ends mid-stream', async () => {
    const { controller, voiceTransport } = buildVoiceController();

    await controller.startSession({ mode: 'speech' });

    // Assistant is mid-stream when we tear down (no turn-complete yet).
    voiceTransport.emit({ type: 'input-transcript', text: 'Question' });
    voiceTransport.emit({ type: 'output-transcript', text: 'Partial answer' });

    // End speech mode before turn-complete — the in-flight transcript content
    // should be salvaged and remain visible as transcript artifacts.
    await controller.endSpeechMode();

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-transcript-1',
        role: 'user',
        content: 'Question',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-transcript-2',
        role: 'assistant',
        content: 'Partial answer',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });
});
