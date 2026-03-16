import type { AnswerCitation, AnswerMetadata } from '@livepair/shared-types';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { ProductMode } from '../../core/session.types';
import type { SpeechLifecycleStatus } from '../../speech/speech.types';
import type { TextSessionStatus } from '../../text/text.types';
import type {
  VoiceCaptureState,
  VoicePlaybackState,
  VoiceSessionStatus,
  VoiceToolCall,
  VoiceToolResponse,
} from '../voice.types';

export type VoiceToolName =
  | 'get_current_mode'
  | 'get_voice_session_status'
  | 'report_answer_provenance';

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
  {
    name: 'report_answer_provenance',
    description: 'Record provenance metadata for a factual assistant reply.',
    parameters: {
      type: 'object',
      properties: {
        provenance: {
          type: 'string',
          enum: ['project_grounded', 'web_grounded', 'tool_grounded', 'unverified'],
        },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              uri: { type: 'string' },
            },
            required: ['label'],
            additionalProperties: false,
          },
        },
        confidence: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
        },
        reason: {
          type: 'string',
        },
      },
      required: ['provenance'],
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAnswerProvenance(value: unknown): value is AnswerMetadata['provenance'] {
  return (
    value === 'project_grounded'
    || value === 'web_grounded'
    || value === 'tool_grounded'
    || value === 'unverified'
  );
}

function isAnswerConfidence(value: unknown): value is NonNullable<AnswerMetadata['confidence']> {
  return value === 'low' || value === 'medium' || value === 'high';
}

function normalizeAnswerCitation(value: unknown): AnswerCitation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const label = 'label' in value ? value['label'] : undefined;
  const uri = 'uri' in value ? value['uri'] : undefined;

  if (!isNonEmptyString(label)) {
    return null;
  }

  if (typeof uri !== 'undefined' && !isNonEmptyString(uri)) {
    return null;
  }

  return {
    label: label.trim(),
    ...(typeof uri === 'string' ? { uri: uri.trim() } : {}),
  };
}

function normalizeAnswerMetadata(argumentsValue: Record<string, unknown>): AnswerMetadata | null {
  const provenance = argumentsValue['provenance'];
  const confidence = argumentsValue['confidence'];
  const reason = argumentsValue['reason'];
  const citations = argumentsValue['citations'];

  if (!isAnswerProvenance(provenance)) {
    return null;
  }

  if (typeof confidence !== 'undefined' && !isAnswerConfidence(confidence)) {
    return null;
  }

  if (typeof reason !== 'undefined' && !isNonEmptyString(reason)) {
    return null;
  }

  if (typeof citations !== 'undefined' && !Array.isArray(citations)) {
    return null;
  }

  const normalizedCitations = citations?.map((citation) => normalizeAnswerCitation(citation));

  if (normalizedCitations?.some((citation) => citation === null)) {
    return null;
  }

  return {
    provenance,
    ...(normalizedCitations && normalizedCitations.length > 0
      ? { citations: normalizedCitations as AnswerCitation[] }
      : {}),
    ...(typeof confidence === 'string' ? { confidence } : {}),
    ...(typeof reason === 'string' ? { reason: reason.trim() } : {}),
  };
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

    if (call.name === 'report_answer_provenance') {
      const answerMetadata = normalizeAnswerMetadata(call.arguments);

      if (!answerMetadata) {
        return createToolErrorResponse(
          call,
          'invalid_answer_metadata',
          'Tool "report_answer_provenance" requires a valid provenance payload',
        );
      }

      return {
        id: call.id,
        name: call.name,
        response: {
          ok: true,
          accepted: true,
          answerMetadata,
        },
      };
    }

    return createToolErrorResponse(
      call,
      'tool_not_supported',
      `Tool "${call.name}" is not supported in voice mode`,
    );
  } catch (error) {
    return createToolErrorResponse(
      call,
      'tool_execution_failed',
      asErrorDetail(error, `Tool "${call.name}" failed`),
    );
  }
}
