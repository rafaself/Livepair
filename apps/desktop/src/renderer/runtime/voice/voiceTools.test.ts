import { describe, expect, it } from 'vitest';
import {
  deriveCurrentMode,
  executeLocalVoiceTool,
  type VoiceToolExecutionSnapshot,
} from './voiceTools';

function createSnapshot(
  overrides: Partial<VoiceToolExecutionSnapshot> = {},
): VoiceToolExecutionSnapshot {
  return {
    currentMode: 'text',
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
    expect(deriveCurrentMode(createSnapshot())).toBe('text');
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

  it('returns a deterministic error payload for unsupported tools', async () => {
    await expect(
      executeLocalVoiceTool(
        {
          id: 'call-3',
          name: 'unknown_tool',
          arguments: {},
        },
        createSnapshot(),
      ),
    ).resolves.toEqual({
      id: 'call-3',
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
