import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopSessionController } from './sessionController';
import { resetCurrentChatMemoryForTests } from '../chatMemory/currentChatMemory';
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

    // After settlement the user transcript artifact is replaced by the
    // canonical user turn, and the assistant transcript is materialized as
    // a canonical assistant turn so it persists across navigation.
    voiceTransport.emit({ type: 'turn-complete' });

    expect(visibleTimeline()).toEqual([
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

    // Both user and assistant are materialized as canonical conversation turns
    // so that assistant content persists across navigation.
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
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'Hello there',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
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
        id: 'user-turn-1',
        content: 'Hello there',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
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

  it('persists the explicit assistant draft on turn-complete instead of the transcript artifact text', async () => {
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

    voiceTransport.emit({ type: 'output-transcript', text: 'Transcript bubble reply' });
    voiceTransport.emit({ type: 'text-delta', text: 'Canonical' });
    voiceTransport.emit({ type: 'text-delta', text: ' reply' });
    voiceTransport.emit({ type: 'turn-complete' });

    await vi.waitFor(() => {
      expect(window.bridge.appendChatMessage).toHaveBeenCalledWith({
        chatId: 'chat-1',
        role: 'assistant',
        contentText: 'Canonical reply',
      });
    });

    expect(useSessionStore.getState().conversationTurns).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Canonical reply',
        state: 'complete',
        source: 'voice',
        persistedMessageId: 'assistant-message-1',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Canonical reply',
        persistedMessageId: 'assistant-message-1',
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
        content: 'Canonical reply',
        source: 'voice',
      }),
    ]);
    expect(useSessionStore.getState().transcriptArtifacts).toEqual([]);
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'Hello there',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'Canonical reply',
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
        content: 'Canonical preview',
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

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        content: 'spoken request',
        source: 'voice',
      }),
      expect.objectContaining({
        id: 'user-turn-2',
        content: 'typed follow-up',
        source: 'text',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        content: 'typed reply canonical',
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

    // Before ending, verify the assistant turn is visible as a canonical turn
    // (materialized from transcript since no text-delta was received).
    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Hello',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Hi there',
        state: 'complete',
        source: 'voice',
      }),
    ]);

    // End speech mode — assistant turns must NOT disappear.
    await controller.endSpeechMode();

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Hello',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
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
    // should be salvaged as a canonical assistant turn so it persists.
    await controller.endSpeechMode();

    expect(visibleTimeline()).toEqual([
      expect.objectContaining({
        id: 'user-turn-1',
        role: 'user',
        content: 'Question',
        state: 'complete',
      }),
      expect.objectContaining({
        id: 'assistant-turn-1',
        role: 'assistant',
        content: 'Partial answer',
        state: 'complete',
        source: 'voice',
      }),
    ]);
  });
});
