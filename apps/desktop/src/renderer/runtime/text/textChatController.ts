import {
  appendCompletedAssistantTurn as appendCompletedAssistantTurnCtx,
  appendAssistantTextDelta as appendAssistantTextDeltaCtx,
  appendUserTurn as appendUserTurnCtx,
  clearPendingAssistantTurn as clearPendingAssistantTurnCtx,
  completePendingAssistantTurn as completePendingAssistantTurnCtx,
  failPendingAssistantTurn as failPendingAssistantTurnCtx,
  type ConversationContext,
} from '../conversation/conversationTurnManager';
import { logLifecycleTransition, logRuntimeDiagnostic, logRuntimeError } from '../core/logger';
import { asErrorDetail, createDebugEvent } from '../core/runtimeUtils';
import {
  isSessionActiveLifecycle,
  isTextTurnInFlight,
  reduceTextSessionLifecycle,
  type TextSessionLifecycleEvent,
} from './textSessionLifecycle';
import type {
  RuntimeLogger,
  SessionMode,
} from '../core/session.types';
import type { TransportKind } from '../transport/transport.types';
import type { TextSessionStatus } from './text.types';
import type { ChatMessageRecord, TextChatRequest, TextChatStreamEvent } from '@livepair/shared-types';
import type {
  DesktopSessionControllerDependencies,
  SessionStoreApi,
} from '../core/sessionControllerTypes';

const TEXT_CHAT_ADAPTER_KEY: TransportKind = 'backend-text';

type TextChatStream = Awaited<
  ReturnType<DesktopSessionControllerDependencies['startTextChatStream']>
>;

export type TextChatControllerOps = {
  store: SessionStoreApi;
  logger: RuntimeLogger;
  appendUserMessageToCurrentChat: (text: string) => Promise<ChatMessageRecord | null>;
  buildTextChatRequestFromCurrentChat: () => Promise<TextChatRequest>;
  startTextChatStream: DesktopSessionControllerDependencies['startTextChatStream'];
  conversationCtx: ConversationContext;
  startSessionInternal: (options: { mode: SessionMode }) => Promise<void>;
  setErrorState: (detail: string, failedTurnStatusLabel?: string) => void;
  onConversationTurnSettled?: (turnId: string) => void;
};

export type TextChatController = ReturnType<typeof createTextChatController>;

export function createTextChatController(ops: TextChatControllerOps) {
  let activeTextChatStream: TextChatStream | null = null;

  const currentStatus = (): TextSessionStatus => {
    return ops.store.getState().textSessionLifecycle.status;
  };

  const applyLifecycleEvent = (
    event: TextSessionLifecycleEvent,
  ): TextSessionStatus => {
    const store = ops.store.getState();
    const previousStatus = store.textSessionLifecycle.status;
    const nextLifecycle = reduceTextSessionLifecycle(store.textSessionLifecycle, event);

    if (nextLifecycle.status !== previousStatus) {
      store.setTextSessionLifecycle(nextLifecycle);
      logLifecycleTransition(previousStatus, nextLifecycle.status, event.type);
    }

    return nextLifecycle.status;
  };

  const releaseStream = (): void => {
    const stream = activeTextChatStream;
    activeTextChatStream = null;
    stream?.cancel().catch(() => {});
  };

  const appendAssistantTextDelta = (text: string): void => {
    appendAssistantTextDeltaCtx(ops.conversationCtx, text);
  };

  const appendCompletedAssistantTurn = (content: string, statusLabel?: string): void => {
    appendCompletedAssistantTurnCtx(ops.conversationCtx, content, statusLabel);
  };

  const completePendingAssistantTurn = (statusLabel?: string): string | null => {
    return completePendingAssistantTurnCtx(ops.conversationCtx, statusLabel);
  };

  const failPendingAssistantTurn = (statusLabel: string): string | null => {
    return failPendingAssistantTurnCtx(ops.conversationCtx, statusLabel);
  };

  const clearPendingAssistantTurn = (): void => {
    clearPendingAssistantTurnCtx(ops.conversationCtx);
  };

  const appendUserTurn = (
    content: string,
    options?: { persistedMessageId?: string; persistTurn?: boolean },
  ): string => {
    const turnId = appendUserTurnCtx(ops.conversationCtx, content, options?.persistedMessageId
      ? { persistedMessageId: options.persistedMessageId }
      : undefined);
    if (options?.persistTurn ?? !options?.persistedMessageId) {
      ops.onConversationTurnSettled?.(turnId);
    }
    return turnId;
  };

  const handleStreamEvent = (event: TextChatStreamEvent): void => {
    if (event.type === 'text-delta') {
      applyLifecycleEvent({ type: 'response.delta.received' });
      appendAssistantTextDelta(event.text);
      return;
    }

    if (event.type === 'completed') {
      const previousStatus = currentStatus();
      releaseStream();
      applyLifecycleEvent({ type: 'response.turn.completed' });
      const settledTurnId = completePendingAssistantTurn(
        previousStatus === 'interrupted' ? 'Interrupted' : undefined,
      );
      if (settledTurnId) {
        ops.onConversationTurnSettled?.(settledTurnId);
      }
      ops.store.getState().setAssistantActivity('idle');
      return;
    }

    ops.logger.onTransportEvent({ type: 'error', detail: event.detail });
    ops.store
      .getState()
      .setLastDebugEvent(createDebugEvent('transport', 'error', event.detail));
    releaseStream();
    ops.setErrorState(event.detail, 'Response failed');
  };

  const ensureReady = async (): Promise<boolean> => {
    if (currentStatus() === 'ready' || currentStatus() === 'completed') {
      return true;
    }

    await ops.startSessionInternal({ mode: 'text' });

    return currentStatus() === 'ready' || currentStatus() === 'completed';
  };

  const submitTurn = async (text: string): Promise<boolean> => {
    if (isTextTurnInFlight(currentStatus())) {
      return false;
    }

    const isReady = await ensureReady();

    if (!isReady) {
      logRuntimeError('session', 'submit aborted because text chat is unavailable', {
        textLength: text.length,
      });
      return false;
    }

    applyLifecycleEvent({ type: 'submit.started' });

    let persistedUserMessage: ChatMessageRecord | null = null;

    try {
      persistedUserMessage = await ops.appendUserMessageToCurrentChat(text);
      appendUserTurn(
        text,
        persistedUserMessage?.id
          ? {
              persistedMessageId: persistedUserMessage.id,
              persistTurn: false,
            }
          : { persistTurn: false },
      );
      activeTextChatStream = await ops.startTextChatStream(
        await ops.buildTextChatRequestFromCurrentChat(),
        handleStreamEvent,
      );
    } catch (error) {
      ops.setErrorState(asErrorDetail(error, 'Failed to start text chat'), 'Response failed');
      return false;
    }

    logRuntimeDiagnostic('session', 'text turn submitted', {
      textLength: text.length,
    });
    ops.store.getState().setLastRuntimeError(null);
    return true;
  };

  const hasActiveStream = (): boolean => activeTextChatStream !== null;

  const hasRuntimeActivity = (): boolean => {
    return (
      activeTextChatStream !== null ||
      isSessionActiveLifecycle(currentStatus()) ||
      ops.store.getState().activeTransport === TEXT_CHAT_ADAPTER_KEY
    );
  };

  const resetRuntime = (
    textSessionStatus: TextSessionStatus = 'idle',
    options?: { preserveConversationTurns?: boolean },
  ): void => {
    if (options?.preserveConversationTurns) {
      completePendingAssistantTurn('Interrupted');
    } else {
      clearPendingAssistantTurn();
    }
    ops.store.getState().resetTextSessionRuntime(textSessionStatus, options);
  };

  return {
    TEXT_CHAT_ADAPTER_KEY,
    currentStatus,
    applyLifecycleEvent,
    releaseStream,
    handleStreamEvent,
    ensureReady,
    submitTurn,
    hasActiveStream,
    hasRuntimeActivity,
    resetRuntime,
    appendUserTurn,
    appendCompletedAssistantTurn,
    failPendingAssistantTurn,
    clearPendingAssistantTurn,
  };
}
