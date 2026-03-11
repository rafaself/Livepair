import { describe, expect, it, vi } from 'vitest';
import { asErrorDetail, createDebugEvent } from './runtimeUtils';

describe('asErrorDetail', () => {
  it('returns the error message when error is an Error with a non-empty message', () => {
    expect(asErrorDetail(new Error('something broke'), 'fallback')).toBe('something broke');
  });

  it('returns the fallback when error is an Error with an empty message', () => {
    expect(asErrorDetail(new Error(''), 'fallback')).toBe('fallback');
  });

  it('returns the fallback when error is a string', () => {
    expect(asErrorDetail('oops', 'fallback')).toBe('fallback');
  });

  it('returns the fallback when error is null', () => {
    expect(asErrorDetail(null, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when error is undefined', () => {
    expect(asErrorDetail(undefined, 'fallback')).toBe('fallback');
  });
});

describe('createDebugEvent', () => {
  it('creates a debug event with scope, type, and ISO timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T12:00:00.000Z'));

    const event = createDebugEvent('session', 'test.event');

    expect(event).toEqual({
      scope: 'session',
      type: 'test.event',
      at: '2026-03-09T12:00:00.000Z',
      detail: undefined,
    });

    vi.useRealTimers();
  });

  it('includes detail when provided', () => {
    const event = createDebugEvent('transport', 'error', 'connection lost');
    expect(event.detail).toBe('connection lost');
    expect(event.scope).toBe('transport');
  });
});
