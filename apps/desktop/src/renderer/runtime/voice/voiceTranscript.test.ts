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
    expect(normalizeTranscriptText('Hello', 'Hello there')).toBe('Hello there');
  });

  it('returns incoming when it is longer than previous (replacement)', () => {
    expect(normalizeTranscriptText('Hi', 'Hello there')).toBe('Hello there');
  });

  it('returns incoming when it is shorter than previous (correction)', () => {
    expect(normalizeTranscriptText('Hello there again', 'Hello there')).toBe('Hello there');
  });

  it('stitches at overlapping boundary when lengths are equal', () => {
    // Same length, no startsWith match, overlap at boundary
    expect(normalizeTranscriptText('Hello wo', 'wo there')).toBe('Hello wo there');
  });

  it('concatenates when there is no overlap and lengths are equal', () => {
    expect(normalizeTranscriptText('abcd', 'efgh')).toBe('abcdefgh');
  });
});
