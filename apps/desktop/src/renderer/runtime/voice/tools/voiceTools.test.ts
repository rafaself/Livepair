import { describe, expect, it, vi } from 'vitest';
import {
  deriveCurrentMode,
  executeLocalVoiceTool,
  getVoiceToolDeclarations,
  VOICE_TOOL_DECLARATIONS,
  type VoiceToolExecutionSnapshot,
} from './voiceTools';

function createSnapshot(
  overrides: Partial<VoiceToolExecutionSnapshot> = {},
): VoiceToolExecutionSnapshot {
  return {
    currentMode: 'inactive',
    textSessionStatus: 'idle',
    speechLifecycleStatus: 'off',
    voiceSessionStatus: 'disconnected',
    voiceCaptureState: 'idle',
    voicePlaybackState: 'idle',
    ...overrides,
  };
}

describe('voiceTools', () => {
  it('returns the explicit product mode from the snapshot', () => {
    expect(deriveCurrentMode(createSnapshot())).toBe('inactive');
    expect(
      deriveCurrentMode(
        createSnapshot({
          currentMode: 'speech',
          textSessionStatus: 'ready',
          speechLifecycleStatus: 'listening',
          voiceSessionStatus: 'ready',
        }),
      ),
    ).toBe('speech');
  });

  it('executes get_current_mode with a deterministic response payload', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-1',
          name: 'get_current_mode',
          arguments: {},
        },
        createSnapshot({
          currentMode: 'speech',
          speechLifecycleStatus: 'assistantSpeaking',
          voiceSessionStatus: 'streaming',
        }),
      ),
    ).resolves.toEqual({
      id: 'call-1',
      name: 'get_current_mode',
      response: {
        ok: true,
        mode: 'speech',
      },
    });
  });

  it('executes get_voice_session_status with the runtime status payload', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-2',
          name: 'get_voice_session_status',
          arguments: {},
        },
        createSnapshot({
          voiceSessionStatus: 'recovering',
          speechLifecycleStatus: 'recovering',
          voiceCaptureState: 'capturing',
          voicePlaybackState: 'buffering',
        }),
      ),
    ).resolves.toEqual({
      id: 'call-2',
      name: 'get_voice_session_status',
      response: {
        ok: true,
        speechLifecycleStatus: 'recovering',
        voiceSessionStatus: 'recovering',
        voiceCaptureState: 'capturing',
        voicePlaybackState: 'buffering',
      },
    });
  });

  it('declares project and runtime voice tools without a self-reported provenance tool', () => {
    expect(VOICE_TOOL_DECLARATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'search_project_knowledge',
        }),
      ]),
    );
  });

  it('removes project grounding tools from the declaration surface when grounding is disabled', () => {
    expect(getVoiceToolDeclarations({ groundingEnabled: false })).toEqual([
      expect.objectContaining({ name: 'get_current_mode' }),
      expect.objectContaining({ name: 'get_voice_session_status' }),
    ]);
  });

  it('routes project knowledge searches through the backend bridge and derives grounded metadata', async () => {
    const searchProjectKnowledge = vi.fn(async () => ({
      summaryAnswer: 'Desktop verification uses pnpm verify:desktop.',
      supportingExcerpts: [
        {
          sourceId: 'doc-1',
          text: 'Desktop package verification uses pnpm verify:desktop.',
        },
      ],
      sources: [
        {
          id: 'doc-1',
          title: 'README.md',
          path: 'README.md',
        },
      ],
      confidence: 'high' as const,
      retrievalStatus: 'grounded' as const,
    }));

    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-search-1',
          name: 'search_project_knowledge',
          arguments: {
            query: 'How do I verify the desktop package?',
          },
        },
        createSnapshot(),
        { searchProjectKnowledge },
      ),
    ).resolves.toEqual({
      id: 'call-search-1',
      name: 'search_project_knowledge',
      response: {
        ok: true,
        summaryAnswer: 'Desktop verification uses pnpm verify:desktop.',
        supportingExcerpts: [
          {
            sourceId: 'doc-1',
            text: 'Desktop package verification uses pnpm verify:desktop.',
          },
        ],
        sources: [
          {
            id: 'doc-1',
            title: 'README.md',
            path: 'README.md',
          },
        ],
        confidence: 'high',
        retrievalStatus: 'grounded',
        answerMetadata: {
          provenance: 'project_grounded',
          confidence: 'high',
          citations: [{ label: 'README.md' }],
          reason: 'Derived from successful search_project_knowledge retrieval output.',
        },
      },
    });
    expect(searchProjectKnowledge).toHaveBeenCalledWith({
      query: 'How do I verify the desktop package?',
    });
  });

  it('returns bounded no-match project knowledge results without derived grounded metadata', async () => {
    const searchProjectKnowledge = vi.fn(async () => ({
      summaryAnswer: 'I could not find a verified project document answer for that.',
      supportingExcerpts: [],
      sources: [],
      confidence: 'low' as const,
      retrievalStatus: 'no_match' as const,
      failureReason: 'no_grounding_chunks',
    }));

    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-search-2',
          name: 'search_project_knowledge',
          arguments: {
            query: 'What hidden beta feature ships next month?',
          },
        },
        createSnapshot(),
        { searchProjectKnowledge },
      ),
    ).resolves.toEqual({
      id: 'call-search-2',
      name: 'search_project_knowledge',
      response: {
        ok: true,
        summaryAnswer: 'I could not find a verified project document answer for that.',
        supportingExcerpts: [],
        sources: [],
        confidence: 'low',
        retrievalStatus: 'no_match',
        failureReason: 'no_grounding_chunks',
      },
    });
  });

  it('rejects malformed project knowledge queries deterministically', async () => {
    const searchProjectKnowledge = vi.fn();

    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-search-3',
          name: 'search_project_knowledge',
          arguments: {
            query: '   ',
          },
        },
        createSnapshot(),
        { searchProjectKnowledge },
      ),
    ).resolves.toEqual({
      id: 'call-search-3',
      name: 'search_project_knowledge',
      response: {
        ok: false,
        error: {
          code: 'invalid_project_knowledge_query',
          message: 'Tool "search_project_knowledge" requires a non-empty query string',
        },
      },
    });
    expect(searchProjectKnowledge).not.toHaveBeenCalled();
  });

  it('rejects project knowledge execution when grounding is disabled', async () => {
    const searchProjectKnowledge = vi.fn();

    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-search-4',
          name: 'search_project_knowledge',
          arguments: {
            query: 'How do I verify the desktop package?',
          },
        },
        createSnapshot(),
        { searchProjectKnowledge },
        { groundingEnabled: false },
      ),
    ).resolves.toEqual({
      id: 'call-search-4',
      name: 'search_project_knowledge',
      response: {
        ok: false,
        error: {
          code: 'tool_not_enabled',
          message: 'Tool "search_project_knowledge" is unavailable when grounding is off',
        },
      },
    });
    expect(searchProjectKnowledge).not.toHaveBeenCalled();
  });

  it('rejects provenance-report requests so provenance stays execution-derived', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-4',
          name: 'report_answer_provenance',
          arguments: {
            provenance: 'unverified',
          },
        },
        createSnapshot(),
      ),
    ).resolves.toEqual({
      id: 'call-4',
      name: 'report_answer_provenance',
      response: {
        ok: false,
        error: {
          code: 'tool_not_supported',
          message: 'Tool "report_answer_provenance" is not supported in voice mode',
        },
      },
    });
  });

  it('returns a deterministic error payload for unsupported tools', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-5',
          name: 'unknown_tool',
          arguments: {},
        },
        createSnapshot(),
      ),
    ).resolves.toEqual({
      id: 'call-5',
      name: 'unknown_tool',
      response: {
        ok: false,
        error: {
          code: 'tool_not_supported',
          message: 'Tool "unknown_tool" is not supported in voice mode',
        },
      },
    });
  });
});
