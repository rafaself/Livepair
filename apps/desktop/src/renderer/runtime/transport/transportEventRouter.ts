import { createDebugEvent } from '../core/runtimeUtils';
import type { LiveSessionEvent } from './transport.types';
import { handleTransportSessionEvent } from './transportEventRouterSessionHandlers';
import { handleTransportTurnEvent } from './transportEventRouterTurnHandlers';
import type { TransportEventRouterOps } from './transportEventRouterTypes';

export function createTransportEventRouter(ops: TransportEventRouterOps) {
  const handleTransportEvent = (event: LiveSessionEvent): void => {
    const store = ops.store.getState();

    ops.logger.onTransportEvent(event);
    store.setLastDebugEvent(
      createDebugEvent(
        'transport',
        event.type,
        'detail' in event ? event.detail : undefined,
        ),
      );

    switch (event.type) {
      case 'connection-state-changed':
      case 'go-away':
      case 'connection-terminated':
      case 'error':
      case 'session-resumption-update':
      case 'audio-error':
        handleTransportSessionEvent({ ops, store }, event);
        return;
      case 'interrupted':
      case 'text-delta':
      case 'input-transcript':
      case 'output-transcript':
      case 'audio-chunk':
      case 'generation-complete':
      case 'tool-call':
      case 'turn-complete':
        handleTransportTurnEvent({ ops, store }, event);
        return;
      default:
        return;
    }
  };

  return { handleTransportEvent };
}
