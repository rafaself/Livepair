import { asErrorDetail } from './runtimeUtils';
import { createDefaultVoiceToolState } from './defaults';
import { executeLocalVoiceTool } from './voiceTools';
import type { VoiceToolExecutionSnapshot } from './voiceTools';
import type {
  DesktopSession,
  VoiceToolCall,
  VoiceToolState,
} from './types';

type VoiceToolStoreApi = {
  getState: () => {
    setVoiceToolState: (patch: Partial<VoiceToolState>) => void;
  };
};

type SnapshotProvider = () => VoiceToolExecutionSnapshot;

export type VoiceToolController = {
  enqueue: (calls: VoiceToolCall[]) => void;
  setState: (patch: Partial<VoiceToolState>) => void;
  reset: () => void;
  resetChain: () => void;
};

export function createVoiceToolController(
  store: VoiceToolStoreApi,
  getTransport: () => DesktopSession | null,
  getSnapshot: SnapshotProvider,
  onError: (detail: string) => void,
): VoiceToolController {
  let voiceToolChain = Promise.resolve();

  const setState = (patch: Partial<VoiceToolState>): void => {
    store.getState().setVoiceToolState(patch);
  };

  const reset = (): void => {
    store.getState().setVoiceToolState(createDefaultVoiceToolState());
  };

  const handleVoiceToolCalls = async (
    calls: VoiceToolCall[],
  ): Promise<void> => {
    const transport = getTransport();

    if (!transport || calls.length === 0) {
      return;
    }

    const responses = [];
    let lastError: string | null = null;

    for (const call of calls) {
      if (transport !== getTransport()) {
        return;
      }

      setState({
        status: 'toolCallPending',
        toolName: call.name,
        callId: call.id,
        lastError: null,
      });
      setState({
        status: 'toolExecuting',
        toolName: call.name,
        callId: call.id,
      });

      const response = await executeLocalVoiceTool(call, getSnapshot());
      responses.push(response);

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

    try {
      await transport.sendToolResponses(responses);
    } catch (error) {
      const detail = asErrorDetail(error, 'Failed to respond to voice tool call');
      setState({
        status: 'toolError',
        toolName: calls.at(-1)?.name ?? null,
        callId: calls.at(-1)?.id ?? null,
        lastError: detail,
      });
      onError(detail);
      return;
    }

    setState({
      status: lastError ? 'toolError' : 'idle',
      toolName: calls.at(-1)?.name ?? null,
      callId: calls.at(-1)?.id ?? null,
      lastError,
    });
  };

  const enqueue = (calls: VoiceToolCall[]): void => {
    voiceToolChain = voiceToolChain
      .then(() => handleVoiceToolCalls(calls))
      .catch((error) => {
        const detail = asErrorDetail(error, 'Failed to handle voice tool call');
        setState({
          status: 'toolError',
          lastError: detail,
        });
        onError(detail);
      });
  };

  return {
    enqueue,
    setState,
    reset,
    resetChain: () => {
      voiceToolChain = Promise.resolve();
    },
  };
}
