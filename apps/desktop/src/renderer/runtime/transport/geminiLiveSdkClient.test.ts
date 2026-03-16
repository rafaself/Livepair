import { describe, expect, it } from 'vitest';
import { normalizeGeminiLiveSdkServerMessage } from './geminiLiveSdkClient';

describe('normalizeGeminiLiveSdkServerMessage', () => {
  it('normalizes raw SDK multimodal messages without touching LiveServerMessage.text', () => {
    const rawMessage = {
      serverContent: {
        outputTranscription: {
          text: 'Spoken reply',
        },
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AQIDBA==',
              },
            },
          ],
        },
      },
    };

    Object.defineProperty(rawMessage as Record<string, unknown>, 'text', {
      configurable: true,
      enumerable: true,
      get() {
        throw new Error('LiveServerMessage.text should not be accessed in the SDK shim');
      },
    });

    expect(() => normalizeGeminiLiveSdkServerMessage(rawMessage as never)).not.toThrow();
    expect(normalizeGeminiLiveSdkServerMessage(rawMessage as never)).toEqual({
      serverContent: rawMessage.serverContent,
    });
  });
});
