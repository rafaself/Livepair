import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';

export type GeminiFileSearchStore = {
  name: string;
  displayName: string;
};

export type GeminiFileSearchDocument = {
  name: string;
  displayName: string;
  state: string | null;
  customMetadata: Record<string, string>;
};

export type GeminiGroundedAnswer = {
  text: string;
  groundingMetadata?: unknown;
};

export type GeminiLongRunningOperation = {
  name: string;
  done?: boolean;
  error?: {
    message?: unknown;
  };
};

export type FileSearchCustomMetadata = Array<{
  key: string;
  stringValue: string;
}>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function encodeResourcePath(value: string): string {
  return value.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).trim();

    if (!text) {
      return null;
    }

    try {
      const payload = JSON.parse(text) as {
        message?: unknown;
        error?: {
          message?: unknown;
        } | unknown;
      };

      if (typeof payload.message === 'string' && payload.message.length > 0) {
        return payload.message;
      }

      if (
        isPlainRecord(payload.error)
        && typeof payload.error['message'] === 'string'
        && payload.error['message'].length > 0
      ) {
        return payload.error['message'];
      }
    } catch {
      return text;
    }

    return text;
  } catch {
    return null;
  }
}

export function normalizeStore(value: unknown): GeminiFileSearchStore {
  if (!isPlainRecord(value) || !isNonEmptyString(value['name']) || !isNonEmptyString(value['displayName'])) {
    throw new Error('File Search store payload was invalid');
  }

  return {
    name: value['name'],
    displayName: value['displayName'],
  };
}

export function normalizeStoresResponse(value: unknown): GeminiFileSearchStore[] {
  if (!isPlainRecord(value)) {
    throw new Error('File Search store list payload was invalid');
  }

  const stores = value['fileSearchStores'];
  if (typeof stores === 'undefined') {
    return [];
  }

  if (!Array.isArray(stores)) {
    throw new Error('File Search store list payload was invalid');
  }

  return stores.map((store) => normalizeStore(store));
}

export function normalizeCustomMetadata(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) {
    return {};
  }

  const metadata: Record<string, string> = {};

  for (const entry of value) {
    if (!isPlainRecord(entry) || !isNonEmptyString(entry['key']) || !isNonEmptyString(entry['stringValue'])) {
      continue;
    }

    metadata[entry['key']] = entry['stringValue'];
  }

  return metadata;
}

export function normalizeDocument(value: unknown): GeminiFileSearchDocument {
  if (!isPlainRecord(value) || !isNonEmptyString(value['name']) || !isNonEmptyString(value['displayName'])) {
    throw new Error('File Search document payload was invalid');
  }

  const state = typeof value['state'] === 'string' ? value['state'] : null;

  return {
    name: value['name'],
    displayName: value['displayName'],
    state,
    customMetadata: normalizeCustomMetadata(value['customMetadata']),
  };
}

export function normalizeDocumentsResponse(value: unknown): {
  documents: GeminiFileSearchDocument[];
  nextPageToken: string | null;
} {
  if (!isPlainRecord(value)) {
    throw new Error('File Search document list payload was invalid');
  }

  const documentsValue = value['documents'];
  if (typeof documentsValue !== 'undefined' && !Array.isArray(documentsValue)) {
    throw new Error('File Search document list payload was invalid');
  }

  const nextPageToken = typeof value['nextPageToken'] === 'string' && value['nextPageToken'].length > 0
    ? value['nextPageToken']
    : null;

  return {
    documents: (documentsValue ?? []).map((document) => normalizeDocument(document)),
    nextPageToken,
  };
}

export function normalizeOperation(value: unknown): GeminiLongRunningOperation {
  if (!isPlainRecord(value) || !isNonEmptyString(value['name'])) {
    throw new Error('Long-running operation payload was invalid');
  }

  const error = isPlainRecord(value['error']) ? { message: value['error']['message'] } : undefined;

  return {
    name: value['name'],
    done: value['done'] === true,
    ...(error ? { error } : {}),
  };
}

export function normalizeUploadResponse(value: unknown): { name: string } {
  if (!isPlainRecord(value) || !isPlainRecord(value['file']) || !isNonEmptyString(value['file']['name'])) {
    throw new Error('File upload payload was invalid');
  }

  return {
    name: value['file']['name'],
  };
}

function extractCandidateText(value: unknown): string {
  if (!isPlainRecord(value) || !isPlainRecord(value['content']) || !Array.isArray(value['content']['parts'])) {
    return '';
  }

  return value['content']['parts']
    .map((part) => (isPlainRecord(part) && typeof part['text'] === 'string' ? part['text'].trim() : ''))
    .filter((text) => text.length > 0)
    .join('\n')
    .trim();
}

export function normalizeGroundedAnswer(value: unknown): GeminiGroundedAnswer {
  if (!isPlainRecord(value) || !Array.isArray(value['candidates']) || value['candidates'].length === 0) {
    throw new Error('Grounded answer payload was invalid');
  }

  const candidate = value['candidates'][0];
  if (!isPlainRecord(candidate)) {
    throw new Error('Grounded answer payload was invalid');
  }

  return {
    text: extractCandidateText(candidate),
    groundingMetadata: candidate['groundingMetadata'],
  };
}

export function createCustomMetadata(document: ProjectKnowledgeCorpusDocument): FileSearchCustomMetadata {
  return [
    { key: 'managed_by', stringValue: 'livepair-project-knowledge' },
    { key: 'source_id', stringValue: document.id },
    { key: 'source_path', stringValue: document.relativePath },
    { key: 'content_hash', stringValue: document.contentHash },
  ];
}
