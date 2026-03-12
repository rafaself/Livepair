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
});
