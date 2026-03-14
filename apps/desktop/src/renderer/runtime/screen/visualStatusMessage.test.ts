import { describe, expect, it } from 'vitest';
import {
  getVisualStatusMessage,
  VISUAL_STATUS_MESSAGES,
  type VisualStatusContext,
} from './visualStatusMessage';

// ---------------------------------------------------------------------------
// Wave 7 – Visual Status Messages
//
// Lightweight, pure string helpers for surfacing visual-mode transitions
// to the user/assistant.  No state, no side effects, no I/O.
//
// Contexts:
//   'analyzing'   – a focused snapshot analysis has just been requested
//   'following'   – continuous streaming mode is active
//   'stopped'     – visual sharing has ended (screen share off)
//   'idle'        – screen share is active but no analysis is in progress
//
// The strings are exported as a const map so callers can reference them
// without hard-coding the text.  getVisualStatusMessage() is a simple
// lookup helper that validates the context.
// ---------------------------------------------------------------------------

describe('VISUAL_STATUS_MESSAGES – known messages', () => {
  it('analyzing message mentions analyzing', () => {
    expect(VISUAL_STATUS_MESSAGES.analyzing).toContain('analyzing');
  });

  it('following message mentions following or visually', () => {
    const msg = VISUAL_STATUS_MESSAGES.following.toLowerCase();
    expect(msg.includes('following') || msg.includes('visual')).toBe(true);
  });

  it('stopped message mentions stopped or watching', () => {
    const msg = VISUAL_STATUS_MESSAGES.stopped.toLowerCase();
    expect(msg.includes('stopped') || msg.includes('watch')).toBe(true);
  });

  it('idle message is a non-empty string', () => {
    expect(VISUAL_STATUS_MESSAGES.idle.length).toBeGreaterThan(0);
  });
});

describe('getVisualStatusMessage – lookup', () => {
  it('returns the analyzing message for "analyzing" context', () => {
    expect(getVisualStatusMessage('analyzing')).toBe(VISUAL_STATUS_MESSAGES.analyzing);
  });

  it('returns the following message for "following" context', () => {
    expect(getVisualStatusMessage('following')).toBe(VISUAL_STATUS_MESSAGES.following);
  });

  it('returns the stopped message for "stopped" context', () => {
    expect(getVisualStatusMessage('stopped')).toBe(VISUAL_STATUS_MESSAGES.stopped);
  });

  it('returns the idle message for "idle" context', () => {
    expect(getVisualStatusMessage('idle')).toBe(VISUAL_STATUS_MESSAGES.idle);
  });

  it('returns a non-empty string for every known context', () => {
    const contexts: VisualStatusContext[] = ['analyzing', 'following', 'stopped', 'idle'];
    for (const ctx of contexts) {
      const msg = getVisualStatusMessage(ctx);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe('getVisualStatusMessage – message content expectations', () => {
  it('"analyzing" message matches the expected phrase', () => {
    expect(getVisualStatusMessage('analyzing')).toBe("I'm analyzing the screen");
  });

  it('"following" message matches the expected phrase', () => {
    expect(getVisualStatusMessage('following')).toBe("I'm following along visually");
  });

  it('"stopped" message matches the expected phrase', () => {
    expect(getVisualStatusMessage('stopped')).toBe("I stopped watching the screen");
  });
});

describe('Wave 7 – status message purity', () => {
  it('two calls with the same context return the same string', () => {
    expect(getVisualStatusMessage('analyzing')).toBe(getVisualStatusMessage('analyzing'));
  });

  it('different contexts return different messages', () => {
    const msgs = new Set([
      getVisualStatusMessage('analyzing'),
      getVisualStatusMessage('following'),
      getVisualStatusMessage('stopped'),
      getVisualStatusMessage('idle'),
    ]);
    expect(msgs.size).toBe(4);
  });
});

describe('Wave 7 – non-regression: Wave 4 constants unchanged', () => {
  it('Wave 4 JPEG quality constant is still 0.92', async () => {
    const { SCREEN_CAPTURE_JPEG_QUALITY } = await import('./screenCapturePolicy');
    expect(SCREEN_CAPTURE_JPEG_QUALITY).toBe(0.92);
  });

  it('Wave 4 max width constant is still 1920', async () => {
    const { SCREEN_CAPTURE_MAX_WIDTH_PX } = await import('./screenCapturePolicy');
    expect(SCREEN_CAPTURE_MAX_WIDTH_PX).toBe(1920);
  });
});

// Type-level check
const _ctx: VisualStatusContext = 'analyzing';
void _ctx;
