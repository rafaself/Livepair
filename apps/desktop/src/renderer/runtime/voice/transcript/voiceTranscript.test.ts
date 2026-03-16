import { describe, expect, it } from 'vitest';
import { normalizeTranscriptText } from './voiceTranscript';

describe('normalizeTranscriptText', () => {
  it('returns previous when incoming is empty', () => {
    expect(normalizeTranscriptText('Hello', '')).toBe('Hello');
  });

  it('returns previous when incoming is identical', () => {
    expect(normalizeTranscriptText('Hello', 'Hello')).toBe('Hello');
  });

  it('returns incoming when previous is empty', () => {
    expect(normalizeTranscriptText('', 'Hello')).toBe('Hello');
  });

  it('returns incoming when it starts with previous (progressive append)', () => {
    expect(normalizeTranscriptText('Hello', 'Hello there', { role: 'assistant' })).toBe('Hello there');
  });

  it('returns incoming when it is longer than previous (replacement)', () => {
    expect(normalizeTranscriptText('Hi', 'Hello there', { role: 'assistant' })).toBe('Hello there');
  });

  it('allows a final user correction to replace a shorter earlier transcript', () => {
    expect(
      normalizeTranscriptText('Hello there again', 'Hello there', {
        role: 'user',
        isFinal: true,
      }),
    ).toBe('Hello there');
  });

  it('returns incoming when a shorter update is a real user correction rather than a stale prefix', () => {
    expect(
      normalizeTranscriptText('Hello there', 'Hello their', {
        role: 'user',
      }),
    ).toBe('Hello their');
  });

  it('stitches assistant suffix chunks onto the existing transcript', () => {
    expect(normalizeTranscriptText('Hello', ' there', { role: 'assistant' })).toBe('Hello there');
  });

  it('stitches assistant updates at an overlapping boundary', () => {
    expect(normalizeTranscriptText('Hello wo', 'wo there', { role: 'assistant' })).toBe(
      'Hello wo there',
    );
  });

  it('keeps the best assistant transcript when a shorter late update is stale', () => {
    expect(
      normalizeTranscriptText('Hello there', 'Hello', {
        role: 'assistant',
      }),
    ).toBe('Hello there');
  });

  it('keeps the best assistant transcript when a later stale update is contained in the current text', () => {
    expect(
      normalizeTranscriptText('Hello there again', 'there again', {
        role: 'assistant',
      }),
    ).toBe('Hello there again');
  });

  // --- Regression: progressive user transcript overwrite bug ---

  it('accumulates non-overlapping user partials instead of replacing (progressive speech)', () => {
    // Gemini sends independent partial chunks for user speech:
    // "hello" → "good" → "morning"
    // Each chunk is a new recognition window, not a correction.
    let text = normalizeTranscriptText('', 'hello', { role: 'user' });
    expect(text).toBe('hello');

    text = normalizeTranscriptText(text, ' good', { role: 'user' });
    expect(text).toBe('hello good');

    text = normalizeTranscriptText(text, ' morning', { role: 'user' });
    expect(text).toBe('hello good morning');
  });

  it('stitches user transcript at an overlapping boundary', () => {
    expect(
      normalizeTranscriptText('hello wo', 'wo there', { role: 'user' }),
    ).toBe('hello wo there');
  });

  it('deduplicates overlapping user chunks even when the incoming suffix starts with whitespace', () => {
    expect(
      normalizeTranscriptText('hello good', ' good morning', { role: 'user' }),
    ).toBe('hello good morning');
  });

  it('keeps longer user transcript when a shorter stale partial arrives', () => {
    expect(
      normalizeTranscriptText('hello there', 'hello', { role: 'user' }),
    ).toBe('hello there');
  });
});
