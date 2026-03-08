export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export function normalizeBackendBaseUrl(input: string): string | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const pathname = url.pathname.replace(/\/+$/, '');

    return `${url.protocol}//${url.host}${pathname}`;
  } catch {
    return null;
  }
}

export function resolveBackendBaseUrl(input: string | undefined): string {
  return normalizeBackendBaseUrl(input ?? '') ?? DEFAULT_API_BASE_URL;
}
