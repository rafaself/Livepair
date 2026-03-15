import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationTurnModel } from '../../../../test/fixtures/conversation';
import { AssistantPanelChatView } from './AssistantPanelChatView';

describe('AssistantPanelChatView', () => {
  it('renders the empty conversation state when there are no turns', () => {
    render(
      <AssistantPanelChatView
        assistantState="disconnected"
        currentMode="inactive"
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.queryByRole('status', { name: 'Disconnected' })).toBeNull();
    expect(screen.getByText('Talk to Livepair')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Talk' })).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
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
        currentMode="inactive"
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.queryByRole('status', { name: 'Ready' })).toBeNull();
    expect(screen.getByText('Check the latest exchange.')).toBeVisible();
    expect(screen.getByText('The latest exchange is visible in the transcript.')).toBeVisible();
    expect(screen.queryByText('Live session history starts here')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume Live Session' })).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('marks an opened past chat as an inactive history container while keeping preserved turns visible', () => {
    const turns: ConversationTurnModel[] = [
      {
        id: 'turn-1',
        role: 'user',
        content: 'Earlier question',
        timestamp: '10:15',
        state: 'complete',
      },
      {
        id: 'turn-2',
        role: 'assistant',
        content: 'Earlier answer',
        timestamp: '10:16',
        state: 'complete',
      },
    ];

    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={turns}
        isConversationEmpty={false}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        activeChat={{
          id: 'chat-history-1',
          title: 'Interview prep',
          createdAt: '2026-03-11T09:00:00.000Z',
          updatedAt: '2026-03-11T10:00:00.000Z',
          isCurrent: false,
        }}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('Earlier question')).toBeVisible();
    expect(screen.getByText('Earlier answer')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Resume Live Session' })).toBeVisible();
  });

  it('shows safe latest-session metadata for an opened past chat when resume is potentially available', () => {
    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        activeChat={{
          id: 'chat-history-2',
          title: 'Debug review',
          createdAt: '2026-03-11T09:00:00.000Z',
          updatedAt: '2026-03-11T10:00:00.000Z',
          isCurrent: false,
        }}
        latestLiveSession={{
          id: 'live-session-2',
          chatId: 'chat-history-2',
          startedAt: '2026-03-11T09:15:00.000Z',
          endedAt: null,
          status: 'active',
          endedReason: null,
          resumptionHandle: 'handles/live-session-2',
          lastResumptionUpdateAt: '2026-03-11T09:25:00.000Z',
          restorable: true,
          invalidatedAt: null,
          invalidationReason: null,
        }}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('Latest Live session')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByText('Resume may be available')).toBeVisible();
    expect(screen.getByText(/Started/)).toBeVisible();
    expect(screen.getByText(/Resume state updated/)).toBeVisible();
  });

  it('shows safe fallback-oriented metadata without exposing raw restore diagnostics', () => {
    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        activeChat={{
          id: 'chat-history-3',
          title: 'Incident follow-up',
          createdAt: '2026-03-10T09:00:00.000Z',
          updatedAt: '2026-03-10T10:00:00.000Z',
          isCurrent: false,
        }}
        latestLiveSession={{
          id: 'live-session-3',
          chatId: 'chat-history-3',
          startedAt: '2026-03-10T09:15:00.000Z',
          endedAt: '2026-03-10T09:45:00.000Z',
          status: 'failed',
          endedReason: 'Gemini Live session is not resumable at this point',
          resumptionHandle: null,
          lastResumptionUpdateAt: '2026-03-10T09:40:00.000Z',
          restorable: false,
          invalidatedAt: '2026-03-10T09:40:00.000Z',
          invalidationReason: 'Gemini Live session is not resumable at this point',
        }}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('Ended unexpectedly')).toBeVisible();
    expect(screen.getByText('New Live session likely')).toBeVisible();
    expect(screen.getByText(/^Ended$/)).toBeVisible();
    expect(screen.queryByText('Gemini Live session is not resumable at this point')).toBeNull();
  });

  it('shows a visible runtime error state when the transport fails', () => {
    render(
      <AssistantPanelChatView
        assistantState="error"
        currentMode="inactive"
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.queryByRole('status', { name: 'Error' })).toBeNull();
    expect(screen.getByText('Live session unavailable')).toBeVisible();
    expect(screen.getByText('transport offline')).toBeVisible();
    expect(screen.getByText(/start live session again/i)).toBeVisible();
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
        currentMode="inactive"
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('transport offline')).toBeVisible();
    expect(screen.getByText('Partial streamed response')).toBeVisible();
    expect(screen.getByText('Disconnected')).toBeVisible();
  });

  it('keeps typed input unavailable while the chat is inactive', () => {
    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Summarize this"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send note to session' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Talk' })).toBeEnabled();
  });

  it('submits text with Enter and disables the composer while a send is pending during an active Live session', () => {
    const handleDraftTextChange = () => {};
    const handleSubmitTextTurn = vi.fn((event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
    });

    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="speech"
        speechLifecycleStatus="listening"
        activeTransport="gemini-live"
        voiceSessionStatus="ready"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Summarize this"
        isSubmittingTextTurn={false}
        onDraftTextChange={handleDraftTextChange}
        onSubmitTextTurn={handleSubmitTextTurn}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    fireEvent.submit(screen.getByRole('form', { name: 'Send a typed note to the Live session' }));

    expect(handleSubmitTextTurn).toHaveBeenCalledTimes(1);

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="speech"
        speechLifecycleStatus="assistantSpeaking"
        activeTransport="gemini-live"
        voiceSessionStatus="ready"
        textSessionStatus="receiving"
        canSubmitText={false}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Summarize this"
        isSubmittingTextTurn={true}
        onDraftTextChange={handleDraftTextChange}
        onSubmitTextTurn={handleSubmitTextTurn}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Add a note to the session')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send note to session' })).toBeDisabled();
  });

  it('keeps the active Live composer enabled after a completed turn and disables it while connecting', () => {
    const { rerender } = render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="speech"
        speechLifecycleStatus="listening"
        activeTransport="gemini-live"
        voiceSessionStatus="ready"
        textSessionStatus="completed"
        canSubmitText={true}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Follow up"
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Add a note to the session')).toBeEnabled();

    rerender(
      <AssistantPanelChatView
        assistantState="thinking"
        currentMode="speech"
        speechLifecycleStatus="starting"
        activeTransport="gemini-live"
        voiceSessionStatus="connecting"
        textSessionStatus="connecting"
        canSubmitText={false}
        turns={[]}
        isConversationEmpty={true}
        lastRuntimeError={null}
        draftText="Follow up"
        isSubmittingTextTurn={true}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Add a note to the session')).toBeDisabled();
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('Can you summarize that?')).toBeVisible();
    expect(screen.getByText('Here is the summary.')).toBeVisible();
    expect(screen.getByText('Responding...')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Current speech turn' })).toBeNull();
    expect(screen.queryByText('Send a text prompt to start the realtime loop and keep the latest exchange visible.')).toBeNull();
  });

  it('fades the centered empty state and shows the composer when voice mode is active before transcript arrives', () => {
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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    // CTA button is removed from the empty state once the session is active
    expect(screen.queryByRole('button', { name: 'Talk' })).toBeNull();
    // The End button is accessible in the active composer
    expect(screen.getByRole('button', { name: 'End Live session' })).toBeVisible();
    // Old inactive copy is not shown
    expect(screen.queryByText('Live session history starts here')).toBeNull();
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
        onStartSpeechModeWithScreen={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'Send note to session' })).toBeEnabled();

    fireEvent.submit(screen.getByRole('form', { name: 'Send a typed note to the Live session' }));

    expect(handleSubmitTextTurn).toHaveBeenCalledTimes(1);
    expect(handleStartSpeechMode).not.toHaveBeenCalled();
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
  });

  it('starts a Live session from the inactive continuation CTA', () => {
    const handleSubmitTextTurn = vi.fn();
    const handleStartSpeechMode = vi.fn(async () => undefined);
    const handleEndSpeechMode = vi.fn(async () => undefined);

    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
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
        onStartSpeechModeWithScreen={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'Talk' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Talk' }));

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
        onStartSpeechModeWithScreen={handleStartSpeechMode}
        onEndSpeechMode={handleEndSpeechMode}
      />,
    );

    expect(screen.getByRole('button', { name: 'End Live session' })).toBeEnabled();

    fireEvent.submit(screen.getByRole('form', { name: 'Send a typed note to the Live session' }));

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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Add a note to the session')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send note to session' })).toBeDisabled();

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
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    expect(screen.getByPlaceholderText('Add a note to the session')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send note to session' })).toBeDisabled();
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
        onStartSpeechModeWithScreen={noop}
        onEndSpeechMode={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Starting Live session' })).toBeDisabled();

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
        onStartSpeechModeWithScreen={noop}
        onEndSpeechMode={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ending Live session' })).toBeDisabled();
  });

  it('renders a stable left-controls, main-content, and right-action shell during an active Live session', () => {
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
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    const composerLayout = screen.getByTestId('assistant-panel-composer-layout');
    const leftControls = screen.getByTestId('assistant-panel-composer-left-controls');
    const mainContent = screen.getByTestId('assistant-panel-composer-main');
    const rightAction = screen.getByTestId('assistant-panel-composer-right-action');

    expect(Array.from(composerLayout.children)).toEqual([
      leftControls,
      mainContent,
      rightAction,
    ]);
    expect(
      within(leftControls).getByRole('button', { name: 'Disable microphone' }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', { name: 'Microphone options' }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', { name: 'Start screen share' }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', { name: 'Screen share options' }),
    ).toBeVisible();
    expect(within(mainContent).getByRole('textbox')).toHaveValue('Keep this in text');
    expect(
      within(rightAction).getByRole('button', { name: 'Send note to session' }),
    ).toBeVisible();
  });

  it('keeps the shell and right-side primary action when resuming a non-empty inactive session', () => {
    render(
      <AssistantPanelChatView
        assistantState="ready"
        currentMode="inactive"
        speechLifecycleStatus="off"
        textSessionStatus="ready"
        canSubmitText={true}
        turns={[
          {
            id: 'turn-1',
            role: 'user',
            content: 'Earlier question',
            timestamp: '10:15',
            state: 'complete',
          },
        ]}
        isConversationEmpty={false}
        lastRuntimeError={null}
        draftText=""
        isSubmittingTextTurn={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    const composerLayout = screen.getByTestId('assistant-panel-composer-layout');
    const leftControls = screen.getByTestId('assistant-panel-composer-left-controls');
    const mainContent = screen.getByTestId('assistant-panel-composer-main');
    const rightAction = screen.getByTestId('assistant-panel-composer-right-action');

    expect(Array.from(composerLayout.children)).toEqual([
      leftControls,
      mainContent,
      rightAction,
    ]);
    expect(
      within(leftControls).getByRole('button', { name: 'Disable microphone' }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', { name: 'Microphone options' }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', {
        name: 'Start Live session with screen share',
      }),
    ).toBeVisible();
    expect(
      within(leftControls).getByRole('button', { name: 'Screen share options' }),
    ).toBeVisible();
    expect(within(mainContent).queryByRole('textbox')).toBeNull();
    expect(
      within(rightAction).getByRole('button', { name: 'Resume Live Session' }),
    ).toBeVisible();
  });

  it('toggles the left microphone control visually without changing the active session action or adjacent media controls', () => {
    const handleToggleMicrophone = vi.fn();
    const handleEndSpeechMode = vi.fn(async () => undefined);
    const { rerender } = render(
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
        draftText=""
        isSubmittingTextTurn={false}
        isComposerMicrophoneEnabled={true}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={handleEndSpeechMode}
        onToggleComposerMicrophone={handleToggleMicrophone}
      />,
    );

    const micButton = screen.getByRole('button', { name: 'Disable microphone' });
    expect(micButton).toHaveAttribute('aria-pressed', 'true');
    expect(micButton).toHaveClass('assistant-panel__composer-control--active');
    expect(screen.getByRole('button', { name: 'Microphone options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start screen share' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Screen share options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'End Live session' })).toBeVisible();

    fireEvent.click(micButton);

    expect(handleToggleMicrophone).toHaveBeenCalledTimes(1);
    expect(handleEndSpeechMode).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Microphone options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start screen share' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Screen share options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'End Live session' })).toBeVisible();

    rerender(
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
        draftText=""
        isSubmittingTextTurn={false}
        isComposerMicrophoneEnabled={false}
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={handleEndSpeechMode}
        onToggleComposerMicrophone={handleToggleMicrophone}
      />,
    );

    const disabledMicButton = screen.getByRole('button', { name: 'Enable microphone' });
    expect(disabledMicButton).toHaveAttribute('aria-pressed', 'false');
    expect(disabledMicButton).toHaveClass('assistant-panel__composer-control--inactive');
    expect(disabledMicButton).not.toHaveClass('assistant-panel__composer-control--active');
    expect(screen.getByRole('button', { name: 'Microphone options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start screen share' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Screen share options' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'End Live session' })).toBeVisible();
  });

  it('splits microphone and screen share controls into separate dropdowns without regressing the main action buttons', async () => {
    const handleToggleMicrophone = vi.fn();
    const handleToggleScreenShare = vi.fn();
    const handleSelectInputDevice = vi.fn();
    const handleSelectScreenSource = vi.fn();

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
        draftText=""
        isSubmittingTextTurn={false}
        isComposerMicrophoneEnabled={true}
        inputDeviceOptions={[
          { value: 'default', label: 'System default' },
          { value: 'usb-mic', label: 'USB Microphone' },
          { value: 'desk-mic', label: 'Desk Mic' },
        ]}
        selectedInputDeviceId="usb-mic"
        screenCaptureSourceOptions={[
          { value: 'screen:1:0', label: 'Entire Screen' },
          { value: 'window:42:0', label: 'VSCode' },
        ]}
        selectedScreenCaptureSourceId="screen:1:0"
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onToggleComposerMicrophone={handleToggleMicrophone}
        onToggleComposerScreenShare={handleToggleScreenShare}
        onSelectComposerInputDevice={handleSelectInputDevice}
        onSelectComposerScreenSource={handleSelectScreenSource}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    const microphoneOptionsButton = screen.getByRole('button', {
      name: 'Microphone options',
    });
    expect(microphoneOptionsButton).toHaveAttribute('aria-haspopup', 'listbox');
    expect(microphoneOptionsButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(microphoneOptionsButton);

    const microphoneDropdown = screen.getByRole('listbox');
    expect(microphoneOptionsButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(microphoneDropdown).getByRole('option', { name: 'System default' }),
    ).toBeVisible();
    expect(
      within(microphoneDropdown).getByRole('option', { name: 'USB Microphone' }),
    ).toBeVisible();
    expect(within(microphoneDropdown).getByRole('option', { name: 'Desk Mic' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Disable microphone' }));

    expect(handleToggleMicrophone).toHaveBeenCalledTimes(1);
    expect(handleToggleScreenShare).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'End Live session' })).toBeVisible();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
    expect(microphoneOptionsButton).toHaveAttribute('aria-expanded', 'false');
    expect(handleSelectInputDevice).not.toHaveBeenCalled();

    const screenOptionsButton = screen.getByRole('button', {
      name: 'Screen share options',
    });
    expect(screenOptionsButton).toHaveAttribute('aria-haspopup', 'listbox');
    expect(screenOptionsButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screenOptionsButton);

    const screenDropdown = screen.getByRole('listbox');
    expect(screenOptionsButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(screenDropdown).getByRole('option', { name: 'Entire Screen' })).toBeVisible();
    expect(within(screenDropdown).getByRole('option', { name: 'VSCode' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Start screen share' }));

    expect(handleToggleScreenShare).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });
    expect(screenOptionsButton).toHaveAttribute('aria-expanded', 'false');
    expect(handleSelectInputDevice).not.toHaveBeenCalled();
    expect(handleSelectScreenSource).not.toHaveBeenCalled();
  });

  it('opens the composer microphone and screen dropdowns upward', async () => {
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
        draftText=""
        isSubmittingTextTurn={false}
        inputDeviceOptions={[
          { value: 'default', label: 'System default' },
          { value: 'usb-mic', label: 'USB Microphone' },
        ]}
        selectedInputDeviceId="default"
        screenCaptureSourceOptions={[
          { value: 'screen:1:0', label: 'Entire Screen' },
          { value: 'window:42:0', label: 'VSCode' },
        ]}
        selectedScreenCaptureSourceId="screen:1:0"
        onDraftTextChange={() => {}}
        onSubmitTextTurn={() => {}}
        onStartSpeechMode={() => Promise.resolve()}
        onStartSpeechModeWithScreen={() => Promise.resolve()}
        onEndSpeechMode={() => Promise.resolve()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Microphone options' }));

    expect(document.querySelector('.floating-layer')).toHaveClass('floating-layer--up');

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Screen share options' }));

    expect(document.querySelector('.floating-layer')).toHaveClass('floating-layer--up');
  });
});
