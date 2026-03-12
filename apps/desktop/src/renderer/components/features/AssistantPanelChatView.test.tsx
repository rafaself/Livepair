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
        canSubmitText={true}
        turns={[]}
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

    expect(screen.queryByRole('status', { name: 'Disconnected' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Conversation' })).toBeVisible();
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
        canSubmitText={true}
        turns={turns}
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

    expect(screen.queryByRole('status', { name: 'Ready' })).toBeNull();
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
        canSubmitText={true}
        turns={[]}
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

    expect(screen.queryByRole('status', { name: 'Error' })).toBeNull();
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
        canSubmitText={true}
        turns={turns}
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
        canSubmitText={true}
        turns={[]}
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
        canSubmitText={false}
        turns={[]}
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
        canSubmitText={true}
        turns={[]}
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

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="text"
        textSessionStatus="connecting"
        canSubmitText={false}
        turns={[]}
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
  });

  it('renders live voice turns inside the conversation timeline and hides the legacy transcript panel', () => {
    render(
      <AssistantPanelChatView
        assistantState="speaking"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="disconnected"
        canSubmitText={true}
        turns={[
          {
            id: 'user-turn-1',
            role: 'user',
            content: 'Can you summarize that?',
            timestamp: '09:41',
            state: 'complete',
          },
          {
            id: 'assistant-turn-1',
            role: 'assistant',
            content: 'Here is the summary.',
            timestamp: '09:42',
            state: 'streaming',
            statusLabel: 'Responding...',
          },
        ]}
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

    expect(screen.getByText('Can you summarize that?')).toBeVisible();
    expect(screen.getByText('Here is the summary.')).toBeVisible();
    expect(screen.getByText('Responding...')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Current speech turn' })).toBeNull();
    expect(screen.queryByText('Send a text prompt to start the realtime loop and keep the latest exchange visible.')).toBeNull();
  });

  it('shows voice-specific placeholder copy when voice mode is active before transcript arrives', () => {
    render(
      <AssistantPanelChatView
        assistantState="listening"
        currentMode="speech"
        speechLifecycleStatus="listening"
        textSessionStatus="disconnected"
        canSubmitText={true}
        turns={[]}
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

    expect(screen.getByText('Start speaking')).toBeVisible();
    expect(
      screen.getByText('Your spoken turns and assistant replies will appear here.'),
    ).toBeVisible();
    expect(screen.queryByText('No conversation yet')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Current speech turn' })).toBeNull();
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
        canSubmitText={true}
        activeTransport="gemini-live"
        voiceSessionStatus="ready"
        turns={[]}
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
        canSubmitText={false}
        turns={[]}
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
        canSubmitText={false}
        turns={[]}
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
        canSubmitText={true}
        activeTransport="gemini-live"
        voiceSessionStatus="connecting"
        turns={[]}
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
        canSubmitText={true}
        activeTransport={null}
        voiceSessionStatus="error"
        turns={[]}
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
        canSubmitText={true}
        turns={[]}
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
        canSubmitText={true}
        turns={[]}
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
