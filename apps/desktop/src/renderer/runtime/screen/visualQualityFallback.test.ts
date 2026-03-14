import { describe, expect, it } from 'vitest';
import {
  createVisualQualityFallbackTracker,
  VISUAL_QUALITY_FALLBACK_REASON,
  type VisualQualityFallbackReason,
} from './visualQualityFallback';

// ---------------------------------------------------------------------------
// Wave 7 – Quality-Change Fallback Tracker
//
// When a contextual quality promotion cannot take effect immediately
// (e.g. no active Live session, or the session does not support mid-session
// resolution changes), the system must not silently lose the intent.
// Instead it records the fallback reason explicitly so the caller can:
//   a) surface a lightweight status message to the user, and
//   b) log / diagnose what happened.
//
// Design invariants:
//   - Pure value object + factory function; no side effects.
//   - `recordFallback(reason)` stores the most recent reason.
//   - `getFallbackReason()` returns the stored reason, or null if none.
//   - `clearFallback()` resets to null (used after successful application).
//   - Known fallback reasons are exported as a const enum-like object so
//     callers never use magic strings.
//   - The tracker does NOT touch DesktopSettings or the quality promoter.
// ---------------------------------------------------------------------------

describe('createVisualQualityFallbackTracker – initial state', () => {
  it('has no fallback reason by default', () => {
    const tracker = createVisualQualityFallbackTracker();
    expect(tracker.getFallbackReason()).toBeNull();
  });

  it('hasFallback() returns false initially', () => {
    const tracker = createVisualQualityFallbackTracker();
    expect(tracker.hasFallback()).toBe(false);
  });
});

describe('createVisualQualityFallbackTracker – recording a fallback', () => {
  it('records no_active_session reason', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    expect(tracker.getFallbackReason()).toBe('no_active_session');
  });

  it('records session_does_not_support_mid_session_quality_change reason', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('session_does_not_support_mid_session_quality_change');
    expect(tracker.getFallbackReason()).toBe(
      'session_does_not_support_mid_session_quality_change',
    );
  });

  it('hasFallback() returns true after recording', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    expect(tracker.hasFallback()).toBe(true);
  });

  it('replaces prior reason if recorded again', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    tracker.recordFallback('session_does_not_support_mid_session_quality_change');
    expect(tracker.getFallbackReason()).toBe(
      'session_does_not_support_mid_session_quality_change',
    );
  });
});

describe('createVisualQualityFallbackTracker – clearing fallback', () => {
  it('clearFallback() resets to null', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    tracker.clearFallback();
    expect(tracker.getFallbackReason()).toBeNull();
  });

  it('hasFallback() returns false after clearFallback()', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    tracker.clearFallback();
    expect(tracker.hasFallback()).toBe(false);
  });

  it('clearFallback() is a safe no-op when no fallback is recorded', () => {
    const tracker = createVisualQualityFallbackTracker();
    expect(() => tracker.clearFallback()).not.toThrow();
    expect(tracker.getFallbackReason()).toBeNull();
  });
});

describe('VISUAL_QUALITY_FALLBACK_REASON – known reasons', () => {
  it('exports no_active_session', () => {
    expect(VISUAL_QUALITY_FALLBACK_REASON.no_active_session).toBe('no_active_session');
  });

  it('exports session_does_not_support_mid_session_quality_change', () => {
    expect(
      VISUAL_QUALITY_FALLBACK_REASON.session_does_not_support_mid_session_quality_change,
    ).toBe('session_does_not_support_mid_session_quality_change');
  });
});

describe('Wave 7 – fallback tracker isolation', () => {
  it('two trackers are fully independent', () => {
    const a = createVisualQualityFallbackTracker();
    const b = createVisualQualityFallbackTracker();
    a.recordFallback('no_active_session');
    expect(b.getFallbackReason()).toBeNull();
  });

  it('getFallbackReason() returns a snapshot (not live mutable)', () => {
    const tracker = createVisualQualityFallbackTracker();
    tracker.recordFallback('no_active_session');
    const reason = tracker.getFallbackReason();
    tracker.clearFallback();
    // The local 'reason' variable should still hold the value we captured
    expect(reason).toBe('no_active_session');
    expect(tracker.getFallbackReason()).toBeNull();
  });
});

// Type-level check: VisualQualityFallbackReason must be the union of known reasons
const _r1: VisualQualityFallbackReason = 'no_active_session';
const _r2: VisualQualityFallbackReason = 'session_does_not_support_mid_session_quality_change';
void _r1;
void _r2;
