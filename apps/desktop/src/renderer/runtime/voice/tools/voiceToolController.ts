import type { AnswerMetadata } from '@livepair/shared-types';
import { asErrorDetail, createDebugEvent } from '../../core/runtimeUtils';
import { createDefaultVoiceToolState } from '../../core/defaults';
import { executeLocalVoiceTool } from './voiceTools';
import type {
  VoiceToolDependencies,
  VoiceToolExecutionSnapshot,
} from './voiceTools';
import type { DesktopSession } from '../../transport/transport.types';
import type {
  VoiceToolCall,
  VoiceToolResponse,
  VoiceToolState,
} from '../voice.types';

const MAX_PROJECT_KNOWLEDGE_EXECUTIONS_PER_SESSION = 3;

type VoiceToolStoreApi = {
  getState: () => {
    setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
    setLastDebugEvent?: (
      event: ReturnType<typeof createDebugEvent>,
    ) => void;
  };
};

type SnapshotProvider = () => VoiceToolExecutionSnapshot;

export type VoiceToolController = {
  enqueue: (calls: VoiceToolCall[]) => void;
  cancel: (detail?: string) => void;
  setState: (patch: Partial<VoiceToolState>) => void;
  reset: () => void;
  resetChain: () => void;
  resetSessionLimits: () => void;
};

export function createVoiceToolController(
  store: VoiceToolStoreApi,
  getTransport: () => DesktopSession | null,
  getSnapshot: SnapshotProvider,
  dependencies?: VoiceToolDependencies,
  getExecutionOptionsOrOnAnswerMetadata?:
    | (() => { groundingEnabled?: boolean })
    | ((answerMetadata: AnswerMetadata) => void),
  maybeOnAnswerMetadata?: (answerMetadata: AnswerMetadata) => void,
): VoiceToolController {
  let voiceToolChain = Promise.resolve();
  let executionVersion = 0;
  let successfulProjectKnowledgeExecutions = 0;
  const getExecutionOptions = maybeOnAnswerMetadata
    ? getExecutionOptionsOrOnAnswerMetadata as (() => { groundingEnabled?: boolean }) | undefined
    : undefined;
  const onAnswerMetadata = maybeOnAnswerMetadata
    ?? getExecutionOptionsOrOnAnswerMetadata as ((answerMetadata: AnswerMetadata) => void) | undefined;

  const setState = (patch: Partial<VoiceToolState>): void => {
    store.getState().setVoiceToolState(patch);
  };

  const setDebugEvent = (type: string, detail?: string): void => {
    store.getState().setLastDebugEvent?.(createDebugEvent('session', type, detail));
  };

  const isActiveExecution = (
    version: number,
    transport: DesktopSession,
  ): boolean => {
    return version === executionVersion && transport === getTransport();
  };

  const cancel = (detail = 'tool execution cancelled'): void => {
    executionVersion += 1;
    voiceToolChain = Promise.resolve();
    reset();
    setDebugEvent('voice.tool.cancelled', detail);
  };

  const reset = (): void => {
    store.getState().setVoiceToolState(createDefaultVoiceToolState());
  };

  const createSessionLimitResponse = (call: VoiceToolCall): VoiceToolResponse => ({
    id: call.id,
    name: call.name,
    response: {
      ok: false as const,
      error: {
        code: 'project_knowledge_limit_reached',
        message:
          `Tool "search_project_knowledge" reached the per-session limit of ${MAX_PROJECT_KNOWLEDGE_EXECUTIONS_PER_SESSION} successful calls`,
      },
    },
  });

  const handleVoiceToolCalls = async (
    calls: VoiceToolCall[],
    version: number,
  ): Promise<void> => {
    const transport = getTransport();

    if (!transport || calls.length === 0) {
      if (calls.length > 0) {
        setDebugEvent('voice.tool.ignored', 'transport unavailable');
      }
      return;
    }

    const responses: VoiceToolResponse[] = [];
    let lastError: string | null = null;

    for (const call of calls) {
      if (!isActiveExecution(version, transport)) {
        return;
      }

      setState({
        status: 'toolCallPending',
        toolName: call.name,
        callId: call.id,
        lastError: null,
      });
      setDebugEvent('voice.tool.pending', `${call.id}:${call.name}`);
      setState({
        status: 'toolExecuting',
        toolName: call.name,
        callId: call.id,
      });
      setDebugEvent('voice.tool.executing', `${call.id}:${call.name}`);

      const response: VoiceToolResponse =
        call.name === 'search_project_knowledge'
        && successfulProjectKnowledgeExecutions >= MAX_PROJECT_KNOWLEDGE_EXECUTIONS_PER_SESSION
          ? createSessionLimitResponse(call)
          : await executeLocalVoiceTool(
              call,
              getSnapshot(),
              dependencies,
              getExecutionOptions?.(),
            );

      if (!isActiveExecution(version, transport)) {
        return;
      }

      responses.push(response);

      if (call.name === 'search_project_knowledge' && response.response['ok'] === true) {
        successfulProjectKnowledgeExecutions += 1;
      }

      const reportedAnswerMetadata = response.response['answerMetadata'];

      if (
        onAnswerMetadata
        && response.response['ok'] === true
        && reportedAnswerMetadata
        && typeof reportedAnswerMetadata === 'object'
        && !Array.isArray(reportedAnswerMetadata)
        && 'provenance' in reportedAnswerMetadata
      ) {
        onAnswerMetadata(reportedAnswerMetadata as AnswerMetadata);
      }

      const errorDetail = response.response['error'];

      if (
        errorDetail &&
        typeof errorDetail === 'object' &&
        'message' in errorDetail &&
        typeof errorDetail.message === 'string'
      ) {
        lastError = errorDetail.message;
      }
    }

    setState({
      status: 'toolResponding',
      toolName: calls.at(-1)?.name ?? null,
      callId: calls.at(-1)?.id ?? null,
      lastError,
    });
    setDebugEvent(
      'voice.tool.responding',
      `${calls.at(-1)?.id ?? 'unknown'}:${calls.at(-1)?.name ?? 'unknown'}`,
    );

    try {
      await transport.submit({
        type: 'tool-responses',
        responses,
      });
    } catch (error) {
      if (!isActiveExecution(version, transport)) {
        return;
      }

      const detail = asErrorDetail(error, 'Failed to respond to voice tool call');
      setState({
        status: 'toolError',
        toolName: calls.at(-1)?.name ?? null,
        callId: calls.at(-1)?.id ?? null,
        lastError: detail,
      });
      setDebugEvent('voice.tool.failed', detail);
      return;
    }

    if (!isActiveExecution(version, transport)) {
      return;
    }

    setState({
      status: lastError ? 'toolError' : 'idle',
      toolName: calls.at(-1)?.name ?? null,
      callId: calls.at(-1)?.id ?? null,
      lastError,
    });
    setDebugEvent(lastError ? 'voice.tool.failed' : 'voice.tool.completed', lastError ?? undefined);
  };

  const enqueue = (calls: VoiceToolCall[]): void => {
    const version = executionVersion;
    voiceToolChain = voiceToolChain
      .then(() => handleVoiceToolCalls(calls, version))
      .catch((error) => {
        const detail = asErrorDetail(error, 'Failed to handle voice tool call');

        if (version !== executionVersion) {
          return;
        }

        setState({
          status: 'toolError',
          lastError: detail,
        });
        setDebugEvent('voice.tool.failed', detail);
      });
  };

  return {
    cancel,
    enqueue,
    setState,
    reset,
    resetChain: () => { cancel('tool execution reset'); },
    resetSessionLimits: () => {
      successfulProjectKnowledgeExecutions = 0;
    },
  };
}
