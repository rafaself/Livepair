import type {
  RealtimeOutboundClassification,
  RealtimeOutboundDecision,
  RealtimeOutboundDiagnostics,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
  RealtimeOutboundGatewayOptions,
} from './outbound.types';

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export function createDefaultRealtimeOutboundDiagnostics(): RealtimeOutboundDiagnostics {
  return {
    breakerState: 'closed',
    consecutiveFailureCount: 0,
    totalSubmitted: 0,
    sentCount: 0,
    droppedCount: 0,
    replacedCount: 0,
    blockedCount: 0,
    lastDecision: null,
    lastReason: null,
    lastEventKind: null,
    lastChannelKey: null,
    lastSequence: null,
    lastReplaceKey: null,
    lastSubmittedAtMs: null,
    lastError: null,
  };
}

export function classifyRealtimeOutboundEvent(
  event: RealtimeOutboundEvent,
): RealtimeOutboundClassification {
  return event.kind === 'visual_frame' ? 'replaceable' : 'non-replaceable';
}

export function createRealtimeOutboundGateway(
  options: RealtimeOutboundGatewayOptions = {},
): RealtimeOutboundGateway {
  const maxConsecutiveFailures = Math.max(
    1,
    options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES,
  );
  let diagnostics = createDefaultRealtimeOutboundDiagnostics();
  const latestSequenceByChannel = new Map<string, number>();
  const latestReplaceableByKey = new Map<string, number>();

  const finalizeDecision = (
    event: RealtimeOutboundEvent,
    decision: RealtimeOutboundDecision,
  ): RealtimeOutboundDecision => {
    diagnostics = {
      ...diagnostics,
      totalSubmitted: diagnostics.totalSubmitted + 1,
      sentCount:
        diagnostics.sentCount + (decision.outcome === 'send' ? 1 : 0),
      droppedCount:
        diagnostics.droppedCount + (decision.outcome === 'drop' ? 1 : 0),
      replacedCount:
        diagnostics.replacedCount + (decision.outcome === 'replace' ? 1 : 0),
      blockedCount:
        diagnostics.blockedCount + (decision.outcome === 'block' ? 1 : 0),
      lastDecision: decision.outcome,
      lastReason: decision.reason,
      lastEventKind: event.kind,
      lastChannelKey: event.channelKey,
      lastSequence: event.sequence,
      lastReplaceKey: event.kind === 'visual_frame' ? event.replaceKey : null,
      lastSubmittedAtMs: event.createdAtMs,
    };

    return decision;
  };

  const submit = (event: RealtimeOutboundEvent): RealtimeOutboundDecision => {
    const classification = classifyRealtimeOutboundEvent(event);

    if (diagnostics.breakerState === 'open') {
      return finalizeDecision(event, {
        outcome: 'block',
        classification,
        reason: 'breaker-open',
      });
    }

    const latestSequence = latestSequenceByChannel.get(event.channelKey);
    if (
      typeof latestSequence === 'number' &&
      event.sequence <= latestSequence
    ) {
      return finalizeDecision(event, {
        outcome: 'drop',
        classification,
        reason: 'stale-sequence',
      });
    }

    latestSequenceByChannel.set(event.channelKey, event.sequence);

    if (event.kind === 'visual_frame') {
      const hadLatestFrame = latestReplaceableByKey.has(event.replaceKey);
      latestReplaceableByKey.set(event.replaceKey, event.sequence);

      return finalizeDecision(event, {
        outcome: hadLatestFrame ? 'replace' : 'send',
        classification,
        reason: hadLatestFrame ? 'superseded-latest' : 'accepted',
      });
    }

    return finalizeDecision(event, {
      outcome: 'send',
      classification,
      reason: 'accepted',
    });
  };

  const reset = (): void => {
    diagnostics = createDefaultRealtimeOutboundDiagnostics();
    latestSequenceByChannel.clear();
    latestReplaceableByKey.clear();
  };

  return {
    submit,
    recordFailure: (detail: string): void => {
      const consecutiveFailureCount = diagnostics.consecutiveFailureCount + 1;
      diagnostics = {
        ...diagnostics,
        consecutiveFailureCount,
        breakerState:
          consecutiveFailureCount >= maxConsecutiveFailures ? 'open' : 'closed',
        lastError: detail,
      };
    },
    recordSuccess: (): void => {
      diagnostics = {
        ...diagnostics,
        breakerState: 'closed',
        consecutiveFailureCount: 0,
        lastError: null,
      };
    },
    reset,
    getDiagnostics: (): RealtimeOutboundDiagnostics => ({ ...diagnostics }),
  };
}
