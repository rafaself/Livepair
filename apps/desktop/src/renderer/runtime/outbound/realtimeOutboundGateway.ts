import type {
  RealtimeOutboundClassification,
  RealtimeOutboundDecision,
  RealtimeOutboundDiagnostics,
  RealtimeOutboundEvent,
  RealtimeOutboundGateway,
  RealtimeOutboundGatewayOptions,
} from './outbound.types';

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const AUDIO_MAX_OUTSTANDING_EVENTS = 2;

function cloneDiagnostics(
  diagnostics: RealtimeOutboundDiagnostics,
): RealtimeOutboundDiagnostics {
  return {
    ...diagnostics,
    droppedByReason: { ...diagnostics.droppedByReason },
    blockedByReason: { ...diagnostics.blockedByReason },
    submittedByKind: { ...diagnostics.submittedByKind },
  };
}

export function createDefaultRealtimeOutboundDiagnostics(): RealtimeOutboundDiagnostics {
  return {
    breakerState: 'closed',
    breakerReason: null,
    consecutiveFailureCount: 0,
    totalSubmitted: 0,
    sentCount: 0,
    droppedCount: 0,
    replacedCount: 0,
    blockedCount: 0,
    droppedByReason: {
      staleSequence: 0,
      laneSaturated: 0,
    },
    blockedByReason: {
      breakerOpen: 0,
    },
    submittedByKind: {
      text: 0,
      audioChunk: 0,
      visualFrame: 0,
    },
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
  const outstandingAudioEventsByChannel = new Map<string, number>();

  const publishDiagnostics = (): void => {
    options.onDiagnosticsChanged?.(cloneDiagnostics(diagnostics));
  };

  const setDiagnostics = (
    nextDiagnostics: RealtimeOutboundDiagnostics,
  ): RealtimeOutboundDiagnostics => {
    diagnostics = nextDiagnostics;
    publishDiagnostics();
    return diagnostics;
  };

  const finalizeDecision = (
    event: RealtimeOutboundEvent,
    decision: RealtimeOutboundDecision,
  ): RealtimeOutboundDecision => {
    const submittedByKindKey =
      event.kind === 'audio_chunk'
        ? 'audioChunk'
        : event.kind === 'visual_frame'
          ? 'visualFrame'
          : 'text';

    setDiagnostics({
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
      droppedByReason: {
        staleSequence:
          diagnostics.droppedByReason.staleSequence
          + (decision.reason === 'stale-sequence' ? 1 : 0),
        laneSaturated:
          diagnostics.droppedByReason.laneSaturated
          + (decision.reason === 'lane-saturated' ? 1 : 0),
      },
      blockedByReason: {
        breakerOpen:
          diagnostics.blockedByReason.breakerOpen
          + (decision.reason === 'breaker-open' ? 1 : 0),
      },
      submittedByKind: {
        ...diagnostics.submittedByKind,
        [submittedByKindKey]:
          diagnostics.submittedByKind[submittedByKindKey] + 1,
      },
      lastDecision: decision.outcome,
      lastReason: decision.reason,
      lastEventKind: event.kind,
      lastChannelKey: event.channelKey,
      lastSequence: event.sequence,
      lastReplaceKey: event.kind === 'visual_frame' ? event.replaceKey : null,
      lastSubmittedAtMs: event.createdAtMs,
    });

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

    if (event.kind === 'audio_chunk') {
      const outstandingAudioEvents =
        outstandingAudioEventsByChannel.get(event.channelKey) ?? 0;

      if (outstandingAudioEvents >= AUDIO_MAX_OUTSTANDING_EVENTS) {
        return finalizeDecision(event, {
          outcome: 'drop',
          classification,
          reason: 'lane-saturated',
        });
      }
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

    if (event.kind === 'audio_chunk') {
      outstandingAudioEventsByChannel.set(
        event.channelKey,
        (outstandingAudioEventsByChannel.get(event.channelKey) ?? 0) + 1,
      );
    }

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
    setDiagnostics(createDefaultRealtimeOutboundDiagnostics());
    latestSequenceByChannel.clear();
    latestReplaceableByKey.clear();
    outstandingAudioEventsByChannel.clear();
  };

  return {
    submit,
    settle: (event: RealtimeOutboundEvent): void => {
      if (event.kind !== 'audio_chunk') {
        return;
      }

      const outstandingAudioEvents =
        outstandingAudioEventsByChannel.get(event.channelKey) ?? 0;

      if (outstandingAudioEvents <= 1) {
        outstandingAudioEventsByChannel.delete(event.channelKey);
        return;
      }

      outstandingAudioEventsByChannel.set(
        event.channelKey,
        outstandingAudioEvents - 1,
      );
    },
    recordFailure: (detail: string): void => {
      const consecutiveFailureCount = diagnostics.consecutiveFailureCount + 1;
      setDiagnostics({
        ...diagnostics,
        consecutiveFailureCount,
        breakerState:
          consecutiveFailureCount >= maxConsecutiveFailures ? 'open' : 'closed',
        breakerReason:
          consecutiveFailureCount >= maxConsecutiveFailures ? detail : null,
        lastError: detail,
      });
    },
    recordSuccess: (): void => {
      setDiagnostics({
        ...diagnostics,
        breakerState: 'closed',
        breakerReason: null,
        consecutiveFailureCount: 0,
        lastError: null,
      });
    },
    reset,
    getDiagnostics: (): RealtimeOutboundDiagnostics => cloneDiagnostics(diagnostics),
  };
}
