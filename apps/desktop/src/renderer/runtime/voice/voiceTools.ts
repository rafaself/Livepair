import type {
  ProductMode,
  SpeechLifecycleStatus,
  TextSessionStatus,
  VoiceCaptureState,
  VoicePlaybackState,
  VoiceSessionStatus,
  VoiceToolCall,
  VoiceToolResponse,
} from '../core/types';

export type VoiceToolName = 'get_current_mode' | 'get_voice_session_status';

export type VoiceToolExecutionSnapshot = {
  currentMode: ProductMode;
  textSessionStatus: TextSessionStatus;
  speechLifecycleStatus: SpeechLifecycleStatus;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  voicePlaybackState: VoicePlaybackState;
};

export const VOICE_TOOL_DECLARATIONS = [
  {
    name: 'get_current_mode',
    description: 'Get the current assistant session mode.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_voice_session_status',
    description: 'Get the current voice session runtime status.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

function createToolErrorResponse(
  call: Pick<VoiceToolCall, 'id' | 'name'>,
  code: string,
  message: string,
): VoiceToolResponse {
  return {
    id: call.id,
    name: call.name,
    response: {
      ok: false,
      error: {
        code,
        message,
      },
    },
  };
}

export function deriveCurrentMode(snapshot: VoiceToolExecutionSnapshot): ProductMode {
  return snapshot.currentMode;
}

export async function executeLocalVoiceTool(
  call: VoiceToolCall,
  snapshot: VoiceToolExecutionSnapshot,
): Promise<VoiceToolResponse> {
  try {
    if (call.name === 'get_current_mode') {
      return {
        id: call.id,
        name: call.name,
        response: {
          ok: true,
          mode: deriveCurrentMode(snapshot),
        },
      };
    }

    if (call.name === 'get_voice_session_status') {
      return {
        id: call.id,
        name: call.name,
        response: {
          ok: true,
          speechLifecycleStatus: snapshot.speechLifecycleStatus,
          voiceSessionStatus: snapshot.voiceSessionStatus,
          voiceCaptureState: snapshot.voiceCaptureState,
          voicePlaybackState: snapshot.voicePlaybackState,
        },
      };
    }

    return createToolErrorResponse(
      call,
      'tool_not_supported',
      `Tool "${call.name}" is not supported in voice mode`,
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : `Tool "${call.name}" failed`;

    return createToolErrorResponse(call, 'tool_execution_failed', message);
  }
}
