import { readFile } from 'fs/promises';
import { setTimeout as delay } from 'timers/promises';
import { Injectable } from '@nestjs/common';
import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const FILE_UPLOAD_START_URL = `${GEMINI_API_BASE_URL}/upload/v1beta/files`;
const FILE_SEARCH_STORES_URL = `${GEMINI_API_BASE_URL}/v1beta/fileSearchStores`;

type GeminiFileSearchStore = {
  name: string;
  displayName: string;
};

type GeminiFileSearchDocument = {
  name: string;
  displayName: string;
  state: string | null;
  customMetadata: Record<string, string>;
};

type GeminiGroundedAnswer = {
  text: string;
  groundingMetadata?: unknown;
};

type GeminiLongRunningOperation = {
  name: string;
  done?: boolean;
  error?: {
    message?: unknown;
  };
};

type FileSearchCustomMetadata = Array<{
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

function encodeResourcePath(value: string): string {
  return value.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function readErrorDetail(response: Response): Promise<string | null> {
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

function normalizeStore(value: unknown): GeminiFileSearchStore {
  if (!isPlainRecord(value) || !isNonEmptyString(value['name']) || !isNonEmptyString(value['displayName'])) {
    throw new Error('File Search store payload was invalid');
  }

  return {
    name: value['name'],
    displayName: value['displayName'],
  };
}

function normalizeStoresResponse(value: unknown): GeminiFileSearchStore[] {
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

function normalizeCustomMetadata(value: unknown): Record<string, string> {
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

function normalizeDocument(value: unknown): GeminiFileSearchDocument {
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

function normalizeDocumentsResponse(value: unknown): {
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

function normalizeOperation(value: unknown): GeminiLongRunningOperation {
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

function normalizeUploadResponse(value: unknown): { name: string } {
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

function normalizeGroundedAnswer(value: unknown): GeminiGroundedAnswer {
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

function createCustomMetadata(document: ProjectKnowledgeCorpusDocument): FileSearchCustomMetadata {
  return [
    { key: 'managed_by', stringValue: 'livepair-project-knowledge' },
    { key: 'source_id', stringValue: document.id },
    { key: 'source_path', stringValue: document.relativePath },
    { key: 'content_hash', stringValue: document.contentHash },
  ];
}

@Injectable()
export class ProjectKnowledgeGeminiClient {
  private async requestJson<T>(
    url: string,
    errorLabel: string,
    init: RequestInit,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const response = await fetch(url, init);

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(detail ? `${errorLabel}: ${detail}` : errorLabel);
    }

    return parse(await response.json());
  }

  async listFileSearchStores(apiKey: string): Promise<GeminiFileSearchStore[]> {
    return this.requestJson(
      `${FILE_SEARCH_STORES_URL}?key=${encodeURIComponent(apiKey)}`,
      'Failed to list File Search stores',
      {
        method: 'GET',
      },
      normalizeStoresResponse,
    );
  }

  async createFileSearchStore(
    apiKey: string,
    displayName: string,
  ): Promise<GeminiFileSearchStore> {
    return this.requestJson(
      `${FILE_SEARCH_STORES_URL}?key=${encodeURIComponent(apiKey)}`,
      'Failed to create File Search store',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
        }),
      },
      normalizeStore,
    );
  }

  async listDocuments(
    apiKey: string,
    storeName: string,
  ): Promise<GeminiFileSearchDocument[]> {
    const documents: GeminiFileSearchDocument[] = [];
    let nextPageToken: string | null = null;

    do {
      const params = new URLSearchParams({
        key: apiKey,
        pageSize: '20',
      });

      if (nextPageToken) {
        params.set('pageToken', nextPageToken);
      }

      const page = await this.requestJson(
        `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(storeName)}/documents?${params.toString()}`,
        'Failed to list File Search documents',
        {
          method: 'GET',
        },
        normalizeDocumentsResponse,
      );

      documents.push(...page.documents);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);

    return documents;
  }

  async deleteDocument(apiKey: string, documentName: string): Promise<void> {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(documentName)}?key=${encodeURIComponent(apiKey)}&force=true`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(detail ? `Failed to delete File Search document: ${detail}` : 'Failed to delete File Search document');
    }
  }

  async uploadFile(
    apiKey: string,
    document: Pick<ProjectKnowledgeCorpusDocument, 'absolutePath' | 'mimeType' | 'title'>,
  ): Promise<{ name: string }> {
    const fileBuffer = await readFile(document.absolutePath);
    const startResponse = await fetch(
      `${FILE_UPLOAD_START_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(fileBuffer.byteLength),
          'X-Goog-Upload-Header-Content-Type': document.mimeType,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: {
            display_name: document.title,
          },
        }),
      },
    );

    if (!startResponse.ok) {
      const detail = await readErrorDetail(startResponse);
      throw new Error(detail ? `Failed to start file upload: ${detail}` : 'Failed to start file upload');
    }

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('Failed to start file upload: missing resumable upload URL');
    }

    return this.requestJson(
      uploadUrl,
      'Failed to upload file bytes',
      {
        method: 'POST',
        headers: {
          'Content-Length': String(fileBuffer.byteLength),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: fileBuffer,
      },
      normalizeUploadResponse,
    );
  }

  async deleteFile(apiKey: string, fileName: string): Promise<void> {
    const response = await fetch(
      `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(fileName)}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(detail ? `Failed to delete uploaded file: ${detail}` : 'Failed to delete uploaded file');
    }
  }

  async importFile(
    apiKey: string,
    storeName: string,
    fileName: string,
    document: ProjectKnowledgeCorpusDocument,
  ): Promise<void> {
    const operation = await this.requestJson(
      `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(storeName)}:importFile?key=${encodeURIComponent(apiKey)}`,
      'Failed to import file into File Search store',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName,
          customMetadata: createCustomMetadata(document),
        }),
      },
      normalizeOperation,
    );

    await this.waitForOperation(apiKey, operation.name);
  }

  async generateGroundedAnswer(
    apiKey: string,
    options: {
      model: string;
      query: string;
      storeName: string;
    },
  ): Promise<GeminiGroundedAnswer> {
    return this.requestJson(
      `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(options.model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      'Failed to query Gemini File Search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'Answer the question using only the curated Livepair project documents available through File Search.',
                    'Be concise and factual. Use at most 3 short sentences.',
                    'If the curated documents do not clearly verify the answer, say that it is not verified.',
                    '',
                    `Question: ${options.query}`,
                  ].join('\n'),
                },
              ],
            },
          ],
          tools: [
            {
              fileSearch: {
                fileSearchStoreNames: [options.storeName],
                topK: 4,
              },
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 220,
          },
        }),
      },
      normalizeGroundedAnswer,
    );
  }

  private async waitForOperation(apiKey: string, operationName: string): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const operation = await this.requestJson(
        `${GEMINI_API_BASE_URL}/v1beta/${encodeResourcePath(operationName)}?key=${encodeURIComponent(apiKey)}`,
        'Failed to poll File Search operation',
        {
          method: 'GET',
        },
        normalizeOperation,
      );

      if (operation.done) {
        if (operation.error && isNonEmptyString(operation.error.message)) {
          throw new Error(`File Search operation failed: ${operation.error.message}`);
        }

        return;
      }

      await delay(500);
    }

    throw new Error('File Search operation timed out');
  }
}
