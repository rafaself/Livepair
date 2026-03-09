import { MOCK_SESSION_SCRIPT } from './mockConversationData';
import type {
  ConversationTurnModel,
  DesktopSessionTransportConnectParams,
  DesktopSessionTransport,
  TransportEvent,
} from './types';

const USER_TURN_DELAY_MS = 2000;
const THINKING_DELAY_MS = 1500;
const STREAM_INTERVAL_MS = 90;
const BASE_TIMESTAMP_MINUTES = 9 * 60 + 45;

function formatTimestamp(minutesSinceMidnight: number): string {
  const hours = Math.floor(minutesSinceMidnight / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (minutesSinceMidnight % 60).toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

export class MockDesktopSessionTransport implements DesktopSessionTransport {
  kind = 'mock' as const;

  private listeners = new Set<(event: TransportEvent) => void>();
  private timerIds: number[] = [];
  private timestampOffset = 0;
  private isConnected = false;

  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(_params: DesktopSessionTransportConnectParams): Promise<void> {
    this.clearScheduledWork();
    this.timestampOffset = 0;
    this.isConnected = true;
    this.emit({ type: 'transport.lifecycle', state: 'connecting' });
    this.emit({ type: 'transport.lifecycle', state: 'connected' });
    this.emit({ type: 'assistant.activity', activity: 'listening' });
    this.runExchange(0);
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.clearScheduledWork();
    this.timestampOffset = 0;
    this.emit({ type: 'transport.lifecycle', state: 'disconnected' });
  }

  private emit(event: TransportEvent): void {
    this.listeners.forEach((listener) => {
      listener(event);
    });
  }

  private clearScheduledWork(): void {
    this.timerIds.forEach((timerId) => {
      window.clearTimeout(timerId);
      window.clearInterval(timerId);
    });
    this.timerIds = [];
  }

  private scheduleTimeout(callback: () => void, delayMs: number): void {
    const timerId = window.setTimeout(callback, delayMs);
    this.timerIds.push(timerId);
  }

  private scheduleInterval(callback: () => void, delayMs: number): number {
    const timerId = window.setInterval(callback, delayMs);
    this.timerIds.push(timerId);

    return timerId;
  }

  private nextTimestamp(): string {
    const timestamp = formatTimestamp(BASE_TIMESTAMP_MINUTES + this.timestampOffset);
    this.timestampOffset += 1;
    return timestamp;
  }

  private appendTurn(turn: ConversationTurnModel): void {
    this.emit({
      type: 'conversation.turn.appended',
      turn,
    });
  }

  private updateAssistantTurn(
    turnId: string,
    content: string,
    state: ConversationTurnModel['state'],
    statusLabel?: string,
  ): void {
    this.emit({
      type: 'conversation.turn.updated',
      turnId,
      content,
      state: state ?? 'complete',
      statusLabel,
    });
  }

  private runExchange(exchangeIndex: number): void {
    if (!this.isConnected) {
      return;
    }

    if (exchangeIndex >= MOCK_SESSION_SCRIPT.length) {
      this.emit({ type: 'assistant.activity', activity: 'ready' });
      return;
    }

    const exchange = MOCK_SESSION_SCRIPT[exchangeIndex];

    if (!exchange) {
      return;
    }

    this.scheduleTimeout(() => {
      if (!this.isConnected) {
        return;
      }

      this.appendTurn({
        id: `mock-user-${exchangeIndex}`,
        role: 'user',
        content: exchange.user,
        timestamp: this.nextTimestamp(),
        state: 'complete',
      });
      this.emit({ type: 'assistant.activity', activity: 'thinking' });

      this.scheduleTimeout(() => {
        if (!this.isConnected) {
          return;
        }

        const turnId = `mock-assistant-${exchangeIndex}`;
        const words = exchange.assistant.split(' ');
        let wordCount = 0;

        this.appendTurn({
          id: turnId,
          role: 'assistant',
          content: '',
          timestamp: this.nextTimestamp(),
          state: 'streaming',
          statusLabel: 'Thinking...',
        });
        this.emit({ type: 'assistant.activity', activity: 'speaking' });

        const intervalId = this.scheduleInterval(() => {
          if (!this.isConnected) {
            return;
          }

          wordCount += 1;
          const isComplete = wordCount >= words.length;
          const content = words.slice(0, wordCount).join(' ');

          this.updateAssistantTurn(
            turnId,
            content,
            isComplete ? 'complete' : 'streaming',
            isComplete ? undefined : 'Thinking...',
          );

          if (!isComplete) {
            return;
          }

          window.clearInterval(intervalId);
          this.timerIds = this.timerIds.filter((timerId) => timerId !== intervalId);

          if (exchangeIndex === MOCK_SESSION_SCRIPT.length - 1) {
            this.emit({ type: 'assistant.activity', activity: 'ready' });
            return;
          }

          this.emit({ type: 'assistant.activity', activity: 'listening' });
          this.runExchange(exchangeIndex + 1);
        }, STREAM_INTERVAL_MS);
      }, THINKING_DELAY_MS);
    }, USER_TURN_DELAY_MS);
  }
}

export function createDesktopSessionTransport(): DesktopSessionTransport {
  return new MockDesktopSessionTransport();
}
