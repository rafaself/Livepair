import type {
  AnswerMetadata,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
} from '@livepair/shared-types';
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
  | 'search_project_knowledge';

export type VoiceToolExecutionSnapshot = {
  currentMode: ProductMode;
  textSessionStatus: TextSessionStatus;
  speechLifecycleStatus: SpeechLifecycleStatus;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  voicePlaybackState: VoicePlaybackState;
};

type VoiceToolDeclaration = {
  name: VoiceToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

const BASE_VOICE_TOOL_DECLARATIONS: readonly VoiceToolDeclaration[] = [
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
];

const PROJECT_GROUNDING_TOOL_DECLARATIONS: readonly VoiceToolDeclaration[] = [
  {
    name: 'search_project_knowledge',
    description: 'Search curated project documents for project-specific facts, architecture, implementation details, internal docs, and specs. Use this for repository-specific factual questions. Do not use it for current public web facts, runtime app state when a direct tool already exists, or brainstorming and stylistic opinions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
] as const;

export function getVoiceToolDeclarations(
  options: {
    groundingEnabled?: boolean;
  } = {},
): readonly VoiceToolDeclaration[] {
  if (options.groundingEnabled === false) {
    return BASE_VOICE_TOOL_DECLARATIONS;
  }

  return [...BASE_VOICE_TOOL_DECLARATIONS, ...PROJECT_GROUNDING_TOOL_DECLARATIONS];
}

export const VOICE_TOOL_DECLARATIONS = getVoiceToolDeclarations();

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

export type VoiceToolDependencies = {
  searchProjectKnowledge: (
    req: ProjectKnowledgeSearchRequest,
  ) => Promise<ProjectKnowledgeSearchResult>;
};

export type VoiceToolExecutionOptions = {
  groundingEnabled?: boolean;
};

function normalizeProjectKnowledgeSearchRequest(
  argumentsValue: Record<string, unknown>,
): ProjectKnowledgeSearchRequest | null {
  const query = argumentsValue['query'];

  if (!isNonEmptyString(query)) {
    return null;
  }

  return {
    query: query.trim(),
  };
}

function deriveProjectKnowledgeAnswerMetadata(
  result: ProjectKnowledgeSearchResult,
): AnswerMetadata | null {
  if (result.retrievalStatus !== 'grounded') {
    return null;
  }

  return {
    provenance: 'project_grounded',
    confidence: result.confidence,
    citations: result.sources.map((source) => ({
      label: source.path ?? source.title,
    })),
    reason: 'Derived from successful search_project_knowledge retrieval output.',
  };
}

export async function executeLocalVoiceTool(
  call: VoiceToolCall,
  snapshot: VoiceToolExecutionSnapshot,
  dependencies?: VoiceToolDependencies,
  options: VoiceToolExecutionOptions = {},
): Promise<VoiceToolResponse> {
  try {
    const groundingEnabled = options.groundingEnabled ?? true;

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

    if (call.name === 'search_project_knowledge') {
      if (!groundingEnabled) {
        return createToolErrorResponse(
          call,
          'tool_not_enabled',
          'Tool "search_project_knowledge" is unavailable when grounding is off',
        );
      }

      const request = normalizeProjectKnowledgeSearchRequest(call.arguments);

      if (!request) {
        return createToolErrorResponse(
          call,
          'invalid_project_knowledge_query',
          'Tool "search_project_knowledge" requires a non-empty query string',
        );
      }

      const searchProjectKnowledge = dependencies?.searchProjectKnowledge
        ?? ((req: ProjectKnowledgeSearchRequest) => window.bridge.searchProjectKnowledge(req));
      const result = await searchProjectKnowledge(request);
      const answerMetadata = deriveProjectKnowledgeAnswerMetadata(result);

      return {
        id: call.id,
        name: call.name,
        response: {
          ok: true,
          ...result,
          ...(answerMetadata ? { answerMetadata } : {}),
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
