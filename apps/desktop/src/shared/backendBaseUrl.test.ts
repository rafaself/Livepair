import { describe, expect, it } from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  normalizeBackendBaseUrl,
  resolveBackendBaseUrl,
} from './backendBaseUrl';

describe('normalizeBackendBaseUrl', () => {
  it('trims whitespace and strips trailing slashes from valid http urls', () => {
    expect(normalizeBackendBaseUrl(' https://api.livepair.dev/base/ ')).toBe(
      'https://api.livepair.dev/base',
    );
    expect(normalizeBackendBaseUrl('http://localhost:3000///')).toBe(
      'http://localhost:3000',
    );
  });

  it('returns null for blank, invalid, or unsupported urls', () => {
    expect(normalizeBackendBaseUrl('')).toBeNull();
    expect(normalizeBackendBaseUrl('   ')).toBeNull();
    expect(normalizeBackendBaseUrl('ftp://bad.example.com')).toBeNull();
    expect(normalizeBackendBaseUrl('not a url')).toBeNull();
  });
});

describe('resolveBackendBaseUrl', () => {
  it('falls back to the default api base url when the input is missing or invalid', () => {
    expect(resolveBackendBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(resolveBackendBaseUrl('ftp://bad.example.com')).toBe(DEFAULT_API_BASE_URL);
  });

  it('returns the normalized backend url when the input is valid', () => {
    expect(resolveBackendBaseUrl(' https://api.livepair.dev/v1/ ')).toBe(
      'https://api.livepair.dev/v1',
    );
  });
});
