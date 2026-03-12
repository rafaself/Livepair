import { fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationTurnModel } from './mockConversation';
import { AssistantPanelChatView } from './AssistantPanelChatView';

describe('AssistantPanelChatView', () => {
  it('renders the empty conversation state when there are no turns', () => {
    render(
      <AssistantPanelChatView
        assistantState="disconnected"
        currentMode="text"
        speechLifecycleStatus="off"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Disconnected' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeVisible();
    expect(screen.getByText('Text session disconnected')).toBeVisible();
    expect(screen.getByText('No conversation yet')).toBeVisible();
    expect(screen.getByPlaceholderText('Ask Livepair')).toBeVisible();
  });

  it('renders populated conversation turns without the empty state copy', () => {
    const turns: ConversationTurnModel[] = [
      {
        id: 'turn-1',
        role: 'user',
        content: 'Check the latest exchange.',
        timestamp: '10:15',
        state: 'complete',
      },
      {
        id: 'turn-2',
        role: 'assistant',
        content: 'The latest exchange is visible in the transcript.',
        timestamp: '10:16',
        state: 'complete',
      },
    ];

    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="text"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        textSessionStatusLabel="Text session ready"
        canSubmitText={true}
        turns={turns}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={false}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Ready' })).toBeVisible();
    expect(screen.getByText('Text session ready')).toBeVisible();
    expect(screen.getByText('Check the latest exchange.')).toBeVisible();
    expect(screen.getByText('The latest exchange is visible in the transcript.')).toBeVisible();
    expect(screen.queryByText('No conversation yet')).toBeNull();
  });

  it('shows a visible runtime error state when the transport fails', () => {
    render(
      <AssistantPanelChatView
        assistantState="error"
        currentMode="text"
        speechLifecycleStatus="off"
        textSessionStatus="error"
        textSessionStatusLabel="Text session failed"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError="transport offline"
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByRole('status', { name: 'Error' })).toBeVisible();
    expect(screen.getByText('Session failed')).toBeVisible();
    expect(screen.getByText('transport offline')).toBeVisible();
    expect(screen.getByText(/start the session again/i)).toBeVisible();
  });

  it('shows inline runtime errors without hiding streamed turns', () => {
    const turns: ConversationTurnModel[] = [
      {
        id: 'turn-1',
        role: 'assistant',
        content: 'Partial streamed response',
        timestamp: '10:16',
        state: 'error',
        statusLabel: 'Disconnected',
      },
    ];

    render(
      <AssistantPanelChatView
        assistantState="error"
        currentMode="text"
        speechLifecycleStatus="off"
        textSessionStatus="error"
        textSessionStatusLabel="Text session failed"
        canSubmitText={true}
        turns={turns}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={false}
        lastRuntimeError="transport offline"
        draftText="retry prompt"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('transport offline')).toBeVisible();
    expect(screen.getByText('Partial streamed response')).toBeVisible();
    expect(screen.getByText('Disconnected')).toBeVisible();
  });

  it('submits text with Enter and disables the composer while a send is pending', () => {
    const handleDraftTextChange = () => {};
    const handleSubmitTextTurn = vi.fn((event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
    });

    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="text"
        textSessionStatus="ready"
        textSessionStatusLabel="Text session ready"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Summarize this"
        isSubmittingTextTurn={false}
        onDraftTextChange={handleDraftTextChange}
        onSubmitTextTurn={handleSubmitTextTurn}
        speechLifecycleStatus="off"
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Send message to Livepair' }));

    expect(handleSubmitTextTurn).toHaveBeenCalledTimes(1);

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="text"
        textSessionStatus="receiving"
        textSessionStatusLabel="Receiving response..."
        canSubmitText={false}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Summarize this"
        isSubmittingTextTurn={true}
        onDraftTextChange={handleDraftTextChange}
        onSubmitTextTurn={handleSubmitTextTurn}
        speechLifecycleStatus="off"
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Ask Livepair')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('keeps the composer enabled after a completed turn and disables it while connecting', () => {
    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="text"
        textSessionStatus="completed"
        textSessionStatusLabel="Response complete"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Follow up"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        speechLifecycleStatus="off"
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Ask Livepair')).toBeEnabled();
    expect(screen.getByText('Response complete')).toBeVisible();

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="text"
        textSessionStatus="connecting"
        textSessionStatusLabel="Preparing text chat..."
        canSubmitText={false}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Follow up"
        isSubmittingTextTurn={true}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        speechLifecycleStatus="off"
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Ask Livepair')).toBeDisabled();
    expect(screen.getByText('Preparing text chat...')).toBeVisible();
  });

  it('renders the current voice transcript section separately from text conversation history', () => {
    render(
      <AssistantPanelChatView
        assistantState="speaking"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: 'Can you summarize that?' },
          assistant: { text: 'Here is the summary.' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Current voice turn' })).toBeVisible();
    expect(screen.getByText('Can you summarize that?')).toBeVisible();
    expect(screen.getByText('Here is the summary.')).toBeVisible();
    expect(screen.getByText('Live voice transcript')).toBeVisible();
    expect(screen.queryByText('Send a text prompt to start the realtime loop and keep the latest exchange visible.')).toBeNull();
  });

  it('shows voice-specific placeholder copy when voice mode is active before transcript arrives', () => {
    render(
      <AssistantPanelChatView
        assistantState="listening"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('Live voice transcript')).toBeVisible();
    expect(screen.getByText('Speak to start the current voice turn transcript.')).toBeVisible();
    expect(screen.queryByText('No conversation yet')).toBeNull();
  });

  it('prioritizes send when the draft has text, even while speech mode is active', () => {
    const handleSubmitTextTurn = vi.fn((event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
    });
    const handleStartSpeechMode = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);

    render(
      <AssistantPanelChatView
        assistantState="listening"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="ready"
        textSessionStatusLabel="Text chat ready"
        canSubmitText={true}
        activeTransport="gemini-live"
        voiceSessionStatus="ready"
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Keep this in text"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={handleSubmitTextTurn}
        onStartSpeechMode={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();

    fireEvent.submit(screen.getByRole('form', { name: 'Send message to Livepair' }));

    expect(handleSubmitTextTurn).toHaveBeenCalledTimes(1);
    expect(handleStartSpeechMode).not.toHaveBeenCalled();
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
  });

  it('starts speech mode from the empty composer when speech mode is off', () => {
    const handleSubmitTextTurn = vi.fn();
    const handleStartSpeechMode = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);

    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="text"
        speechLifecycleStatus="off"
        textSessionStatus="receiving"
        textSessionStatusLabel="Receiving response..."
        canSubmitText={false}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={handleSubmitTextTurn}
        onStartSpeechMode={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'Start speech mode' })).toBeEnabled();

    fireEvent.submit(screen.getByRole('form', { name: 'Send message to Livepair' }));

    expect(handleStartSpeechMode).toHaveBeenCalledTimes(1);
    expect(handleSubmitTextTurn).not.toHaveBeenCalled();
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
  });

  it('ends speech mode from the empty composer when speech mode is active', () => {
    const handleSubmitTextTurn = vi.fn();
    const handleStartSpeechMode = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);

    render(
      <AssistantPanelChatView
        assistantState="listening"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="receiving"
        textSessionStatusLabel="Receiving response..."
        canSubmitText={false}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={handleSubmitTextTurn}
        onStartSpeechMode={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'End speech mode' })).toBeEnabled();

    fireEvent.submit(screen.getByRole('form', { name: 'Send message to Livepair' }));

    expect(handleEndSpeechMode).toHaveBeenCalledTimes(1);
    expect(handleSubmitTextTurn).not.toHaveBeenCalled();
    expect(handleStartSpeechMode).not.toHaveBeenCalled();
  });

  it('disables send while speech mode is transitioning or its runtime is unavailable', () => {
    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="speech"
        speechLifecycleStatus="starting"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        activeTransport="gemini-live"
        voiceSessionStatus="connecting"
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Can you hear me?"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Ask Livepair')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();

    rerender(
      <AssistantPanelChatView
        assistantState="listening"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        activeTransport={null}
        voiceSessionStatus="error"
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Try again"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Ask Livepair')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('disables the empty-composer speech action while speech lifecycle transitions are in progress', () => {
    const noop = vi.fn(async () => undefined);
    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="speech"
        speechLifecycleStatus="starting"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={noop}
        onEndSpeechMode={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Starting speech mode' })).toBeDisabled();

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="speech"
        speechLifecycleStatus="ending"
        textSessionStatus="disconnected"
        textSessionStatusLabel="Text session disconnected"
        canSubmitText={true}
        turns={[]}
        currentVoiceTranscript={{
          user: { text: '' },
          assistant: { text: '' },
        }}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={noop}
        onEndSpeechMode={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ending speech mode' })).toBeDisabled();
  });
});
