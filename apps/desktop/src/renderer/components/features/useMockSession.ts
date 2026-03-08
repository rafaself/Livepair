import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssistantRuntimeState } from '../../state/assistantUiState';
import type { ConversationTurnModel } from './mockConversation';
import { MOCK_SESSION_SCRIPT } from './mockConversation';

const USER_TURN_DELAY_MS = 2000;
const THINKING_DELAY_MS = 1500;
const STREAM_INTERVAL_MS = 90;
const BASE_TIMESTAMP_MINUTES = 9 * 60 + 45;

export type UseMockSessionOptions = {
  assistantState: AssistantRuntimeState;
  enabled?: boolean;
  setAssistantState: (state: AssistantRuntimeState) => void;
};

export type MockSessionState = {
  turns: ConversationTurnModel[];
  isConversationEmpty: boolean;
};

function formatTimestamp(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (minutesSinceMidnight % 60).toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

export function useMockSession({
  assistantState,
  enabled = import.meta.env.DEV,
  setAssistantState,
}: UseMockSessionOptions): MockSessionState {
  const [turns, setTurns] = useState<ConversationTurnModel[]>([]);
  const hasStartedRef = useRef(false);
  const timestampOffsetRef = useRef(0);
  const timerIdsRef = useRef<number[]>([]);

  const clearScheduledWork = useCallback((): void => {
    timerIdsRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
      window.clearInterval(timerId);
    });
    timerIdsRef.current = [];
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number): void => {
    const timerId = window.setTimeout(callback, delayMs);
    timerIdsRef.current.push(timerId);
  }, []);

  const scheduleInterval = useCallback((callback: () => void, delayMs: number): number => {
    const timerId = window.setInterval(callback, delayMs);
    timerIdsRef.current.push(timerId);

    return timerId;
  }, []);

  const nextTimestamp = useCallback((): string => {
    const timestamp = formatTimestamp(BASE_TIMESTAMP_MINUTES + timestampOffsetRef.current);
    timestampOffsetRef.current += 1;
    return timestamp;
  }, []);

  const appendTurn = useCallback((turn: ConversationTurnModel): void => {
    setTurns((previousTurns) => [...previousTurns, turn]);
  }, []);

  const updateLastAssistantTurn = useCallback(
    (content: string, state: ConversationTurnModel['state'], statusLabel?: string): void => {
      setTurns((previousTurns) => {
        if (previousTurns.length === 0) {
          return previousTurns;
        }

        const nextTurns = [...previousTurns];
        const lastTurn = nextTurns.at(-1);

        if (!lastTurn || lastTurn.role !== 'assistant') {
          return previousTurns;
        }

        nextTurns[nextTurns.length - 1] = {
          ...lastTurn,
          content,
          state,
          statusLabel,
        };

        return nextTurns;
      });
    },
    [],
  );

  const runExchange = useCallback(
    (exchangeIndex: number): void => {
      if (exchangeIndex >= MOCK_SESSION_SCRIPT.length) {
        setAssistantState('ready');
        return;
      }

      const exchange = MOCK_SESSION_SCRIPT[exchangeIndex];

      if (!exchange) {
        return;
      }

      scheduleTimeout(() => {
        appendTurn({
          id: `mock-user-${exchangeIndex}`,
          role: 'user',
          content: exchange.user,
          timestamp: nextTimestamp(),
          state: 'complete',
        });
        setAssistantState('thinking');

        scheduleTimeout(() => {
          const words = exchange.assistant.split(' ');
          let wordCount = 0;

          appendTurn({
            id: `mock-assistant-${exchangeIndex}`,
            role: 'assistant',
            content: '',
            timestamp: nextTimestamp(),
            state: 'streaming',
            statusLabel: 'Thinking...',
          });
          setAssistantState('speaking');

          const intervalId = scheduleInterval(() => {
            wordCount += 1;
            const isComplete = wordCount >= words.length;
            const content = words.slice(0, wordCount).join(' ');

            updateLastAssistantTurn(content, isComplete ? 'complete' : 'streaming', isComplete ? undefined : 'Thinking...');

            if (!isComplete) {
              return;
            }

            window.clearInterval(intervalId);
            timerIdsRef.current = timerIdsRef.current.filter((timerId) => timerId !== intervalId);

            if (exchangeIndex === MOCK_SESSION_SCRIPT.length - 1) {
              setAssistantState('ready');
              return;
            }

            setAssistantState('listening');
            runExchange(exchangeIndex + 1);
          }, STREAM_INTERVAL_MS);
        }, THINKING_DELAY_MS);
      }, USER_TURN_DELAY_MS);
    },
    [appendTurn, nextTimestamp, scheduleInterval, scheduleTimeout, setAssistantState, updateLastAssistantTurn],
  );

  useEffect(() => {
    if (!enabled) {
      clearScheduledWork();
      return;
    }

    if (assistantState === 'disconnected') {
      clearScheduledWork();
      hasStartedRef.current = false;
      timestampOffsetRef.current = 0;
      setTurns([]);
      return;
    }

    if (assistantState !== 'listening' || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    runExchange(0);
  }, [assistantState, clearScheduledWork, enabled, runExchange]);

  useEffect(() => {
    return () => {
      clearScheduledWork();
    };
  }, [clearScheduledWork]);

  return useMemo(
    () => ({
      turns,
      isConversationEmpty: turns.length === 0,
    }),
    [turns],
  );
}
