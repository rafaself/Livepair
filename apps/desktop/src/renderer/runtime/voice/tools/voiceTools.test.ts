import { describe, expect, it } from 'vitest';
import {
  deriveCurrentMode,
  executeLocalVoiceTool,
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

  it('declares a provenance-reporting tool for grounded factual replies', () => {
    expect(VOICE_TOOL_DECLARATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'report_answer_provenance',
        }),
      ]),
    );
  });

  it('accepts answer provenance reports without leaking them into answer text', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-3',
          name: 'report_answer_provenance',
          arguments: {
            provenance: 'unverified',
            confidence: 'low',
            reason: 'No verified evidence was available in the provided context.',
          },
        },
        createSnapshot(),
      ),
    ).resolves.toEqual({
      id: 'call-3',
      name: 'report_answer_provenance',
      response: {
        ok: true,
        accepted: true,
        answerMetadata: {
          provenance: 'unverified',
          confidence: 'low',
          reason: 'No verified evidence was available in the provided context.',
        },
      },
    });
  });

  it('rejects malformed provenance reports deterministically', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-4',
          name: 'report_answer_provenance',
          arguments: {
            provenance: 'unsupported',
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
          code: 'invalid_answer_metadata',
          message: 'Tool "report_answer_provenance" requires a valid provenance payload',
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
