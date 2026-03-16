import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AnswerCitation,
  AnswerConfidence,
  AnswerMetadata,
  AnswerProvenance,
  AppendChatMessageRequest,
  ChatId,
  ChatMemoryListOptions,
  ChatMessageRecord,
  ChatRecord,
  CreateChatRequest,
  CreateLiveSessionRequest,
  DurableChatSummaryRecord,
  EndLiveSessionRequest,
  LiveSessionRecord,
  RehydrationPacketContextState,
  UpdateLiveSessionRequest,
} from '@livepair/shared-types';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../database/database.service';
import { parsePersistedContextStateSnapshot } from './chat-memory.context-state';
import {
  ChatMemoryNotFoundError,
} from './chat-memory.errors';
import {
  buildEndedLiveSessionRecord,
  buildUpdatedLiveSessionRecord,
} from './chat-memory.live-session-state';
import {
  normalizeContentText,
  normalizeTitle,
} from './chat-memory.normalization';

const PG_UNIQUE_VIOLATION = '23505';
const CURRENT_CHAT_CONSTRAINT = 'idx_chats_current';

type TimestampValue = Date | string;

type ChatRow = {
  id: string;
  title: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
  is_current: boolean;
};

type MessageRow = {
  id: string;
  chat_id: string;
  role: ChatMessageRecord['role'];
  content_text: string;
  answer_metadata: unknown;
  created_at: TimestampValue;
  sequence: number;
};

type ListedMessageRow = {
  existing_chat_id: string;
  id: string | null;
  chat_id: string | null;
  role: ChatMessageRecord['role'] | null;
  content_text: string | null;
  answer_metadata: unknown;
  created_at: TimestampValue | null;
  sequence: number | null;
};

type LiveSessionRow = {
  id: string;
  chat_id: string;
  started_at: TimestampValue;
  ended_at: TimestampValue | null;
  status: LiveSessionRecord['status'];
  ended_reason: string | null;
  resumption_handle: string | null;
  last_resumption_update_at: TimestampValue | null;
  restorable: boolean;
  invalidated_at: TimestampValue | null;
  invalidation_reason: string | null;
  summary_snapshot: string | null;
  context_state_snapshot: unknown;
};

type ListedLiveSessionRow = {
  existing_chat_id: string;
  id: string | null;
  chat_id: string | null;
  started_at: TimestampValue | null;
  ended_at: TimestampValue | null;
  status: LiveSessionRecord['status'] | null;
  ended_reason: string | null;
  resumption_handle: string | null;
  last_resumption_update_at: TimestampValue | null;
  restorable: boolean | null;
  invalidated_at: TimestampValue | null;
  invalidation_reason: string | null;
  summary_snapshot: string | null;
  context_state_snapshot: unknown;
};

type ChatSummaryRow = {
  chat_id: string;
  schema_version: number;
  source: string;
  summary_text: string;
  covered_through_message_sequence: number;
  updated_at: TimestampValue;
};

type SelectedChatSummaryRow = {
  existing_chat_id: string;
  chat_id: string | null;
  schema_version: number | null;
  source: string | null;
  summary_text: string | null;
  covered_through_message_sequence: number | null;
  updated_at: TimestampValue | null;
};

type SequenceAllocationRow = {
  sequence: number;
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
};

export type ChatMemoryRepository = {
  withTransaction<TResult>(
    operation: (repository: ChatMemoryRepository) => Promise<TResult>,
  ): Promise<TResult>;
  createChat(request?: CreateChatRequest): Promise<ChatRecord>;
  getChat(chatId: ChatId): Promise<ChatRecord | null>;
  getOrCreateCurrentChat(): Promise<ChatRecord>;
  listChats(): Promise<ChatRecord[]>;
  listMessages(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<ChatMessageRecord[]>;
  getChatSummary(chatId: ChatId): Promise<DurableChatSummaryRecord | null>;
  appendMessage(request: AppendChatMessageRequest): Promise<ChatMessageRecord>;
  createLiveSession(request: CreateLiveSessionRequest): Promise<LiveSessionRecord>;
  listLiveSessions(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<LiveSessionRecord[]>;
  upsertChatSummary(summary: DurableChatSummaryRecord): Promise<DurableChatSummaryRecord>;
  updateLiveSession(request: UpdateLiveSessionRequest): Promise<LiveSessionRecord>;
  endLiveSession(request: EndLiveSessionRequest): Promise<LiveSessionRecord>;
};

function isConstraintViolation(
  error: unknown,
  constraint: string,
): error is PgErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const pgError = error as PgErrorLike;
  return pgError.code === PG_UNIQUE_VIOLATION && pgError.constraint === constraint;
}

function toIsoString(value: TimestampValue): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIsoString(value: TimestampValue | null): string | null {
  return value === null ? null : toIsoString(value);
}

function normalizeListLimit(options?: ChatMemoryListOptions): number | null {
  const limit = options?.limit;
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : null;
}

function toChatRecord(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    isCurrent: row.is_current,
  };
}

function toChatMessageRecord(row: MessageRow): ChatMessageRecord {
  const answerMetadata = parsePersistedAnswerMetadata(row.answer_metadata);

  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    contentText: row.content_text,
    ...(answerMetadata ? { answerMetadata } : {}),
    createdAt: toIsoString(row.created_at),
    sequence: row.sequence,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAnswerProvenance(value: unknown): value is AnswerProvenance {
  return (
    value === 'project_grounded'
    || value === 'web_grounded'
    || value === 'tool_grounded'
    || value === 'unverified'
  );
}

function isAnswerConfidence(value: unknown): value is AnswerConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function parsePersistedAnswerCitation(value: unknown): AnswerCitation | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const label = 'label' in value ? value['label'] : undefined;
  const uri = 'uri' in value ? value['uri'] : undefined;

  if (!isNonEmptyString(label)) {
    return null;
  }

  if (typeof uri !== 'undefined' && !isNonEmptyString(uri)) {
    return null;
  }

  return {
    label: label.trim(),
    ...(typeof uri === 'string' ? { uri: uri.trim() } : {}),
  };
}

function parsePersistedAnswerMetadata(value: unknown): AnswerMetadata | undefined {
  if (value === null || typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const provenance = 'provenance' in value ? value['provenance'] : undefined;
  const confidence = 'confidence' in value ? value['confidence'] : undefined;
  const reason = 'reason' in value ? value['reason'] : undefined;
  const citations = 'citations' in value ? value['citations'] : undefined;
  const thinkingText = 'thinkingText' in value ? value['thinkingText'] : undefined;

  if (!isAnswerProvenance(provenance)) {
    return undefined;
  }

  if (typeof confidence !== 'undefined' && !isAnswerConfidence(confidence)) {
    return undefined;
  }

  if (typeof reason !== 'undefined' && !isNonEmptyString(reason)) {
    return undefined;
  }

  if (typeof thinkingText !== 'undefined' && !isNonEmptyString(thinkingText)) {
    return undefined;
  }

  if (typeof citations !== 'undefined' && !Array.isArray(citations)) {
    return undefined;
  }

  const parsedCitations = citations?.map((citation) => parsePersistedAnswerCitation(citation));

  if (parsedCitations?.some((citation) => citation === null)) {
    return undefined;
  }

  return {
    provenance,
    ...(parsedCitations && parsedCitations.length > 0
      ? { citations: parsedCitations as AnswerCitation[] }
      : {}),
    ...(typeof confidence === 'string' ? { confidence } : {}),
    ...(typeof reason === 'string' ? { reason: reason.trim() } : {}),
    ...(typeof thinkingText === 'string' ? { thinkingText: thinkingText.trim() } : {}),
  };
}

function toDurableChatSummaryRecord(row: ChatSummaryRow): DurableChatSummaryRecord {
  return {
    chatId: row.chat_id,
    schemaVersion: row.schema_version,
    source: row.source,
    summaryText: row.summary_text,
    coveredThroughSequence: row.covered_through_message_sequence,
    updatedAt: toIsoString(row.updated_at),
  };
}

function toContextStateSnapshot(
  value: unknown,
): RehydrationPacketContextState | null | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  return parsePersistedContextStateSnapshot(value);
}

function toLiveSessionRecord(row: LiveSessionRow): LiveSessionRecord {
  const record: LiveSessionRecord = {
    id: row.id,
    chatId: row.chat_id,
    startedAt: toIsoString(row.started_at),
    endedAt: toOptionalIsoString(row.ended_at),
    status: row.status,
    endedReason: row.ended_reason,
    resumptionHandle: row.resumption_handle,
    lastResumptionUpdateAt: toOptionalIsoString(row.last_resumption_update_at),
    restorable: row.restorable,
    invalidatedAt: toOptionalIsoString(row.invalidated_at),
    invalidationReason: row.invalidation_reason,
  };

  if (row.summary_snapshot !== null) {
    record.summarySnapshot = row.summary_snapshot;
  }

  const contextStateSnapshot = toContextStateSnapshot(row.context_state_snapshot);
  if (contextStateSnapshot !== undefined && contextStateSnapshot !== null) {
    record.contextStateSnapshot = contextStateSnapshot;
  }

  return record;
}

@Injectable()
export class PostgresChatMemoryRepository implements ChatMemoryRepository {
  constructor(
    private readonly databaseService: DatabaseService,
    @Optional()
    private readonly client: PoolClient | null = null,
  ) {}

  async withTransaction<TResult>(
    operation: (repository: ChatMemoryRepository) => Promise<TResult>,
  ): Promise<TResult> {
    if (this.client !== null) {
      return operation(this);
    }

    const client = await this.databaseService.connect();

    try {
      await client.query('BEGIN');
      const transactionalRepository = new PostgresChatMemoryRepository(
        this.databaseService,
        client,
      );
      const result = await operation(transactionalRepository);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createChat(request?: CreateChatRequest): Promise<ChatRecord> {
    if (this.client === null) {
      return this.withCurrentChatRetry(() =>
        this.withTransaction((repository) => repository.createChat(request)),
      );
    }

    const timestamp = new Date().toISOString();
    const insertedChat = await this.executeQuery<ChatRow>(
      `
        UPDATE chats
        SET is_current = false
        WHERE is_current
      `,
    ).then(async () =>
      this.executeQuery<ChatRow>(
        `
          INSERT INTO chats (id, title, created_at, updated_at, is_current)
          VALUES ($1, $2, $3, $4, true)
          RETURNING id, title, created_at, updated_at, is_current
        `,
        [randomUUID(), normalizeTitle(request?.title), timestamp, timestamp],
      ),
    );

    return toChatRecord(insertedChat.rows[0]!);
  }

  async getChat(chatId: ChatId): Promise<ChatRecord | null> {
    const queryResult = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        WHERE id = $1
      `,
      [chatId],
    );

    return queryResult.rowCount === 0 ? null : toChatRecord(queryResult.rows[0]!);
  }

  async getOrCreateCurrentChat(): Promise<ChatRecord> {
    if (this.client === null) {
      return this.withCurrentChatRetry(() =>
        this.withTransaction((repository) => repository.getOrCreateCurrentChat()),
      );
    }

    const existingCurrentChat = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        WHERE is_current
        LIMIT 1
      `,
    );

    if (existingCurrentChat.rowCount !== 0) {
      return toChatRecord(existingCurrentChat.rows[0]!);
    }

    return this.createChat();
  }

  async listChats(): Promise<ChatRecord[]> {
    const queryResult = await this.executeQuery<ChatRow>(
      `
        SELECT id, title, created_at, updated_at, is_current
        FROM chats
        ORDER BY updated_at DESC, id DESC
      `,
    );

    return queryResult.rows.map((row) => toChatRecord(row));
  }

  async listMessages(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<ChatMessageRecord[]> {
    const limit = normalizeListLimit(options);
    const queryResult = limit === null
      ? await this.executeQuery<ListedMessageRow>(
        `
          WITH selected_chat AS (
            SELECT id
            FROM chats
            WHERE id = $1
          )
          SELECT
            selected_chat.id AS existing_chat_id,
            messages.id,
            messages.chat_id,
            messages.role,
            messages.content_text,
            messages.answer_metadata,
            messages.created_at,
            messages.sequence
          FROM selected_chat
          LEFT JOIN messages ON messages.chat_id = selected_chat.id
          ORDER BY messages.sequence ASC NULLS LAST, messages.id ASC NULLS LAST
        `,
        [chatId],
      )
      : await this.executeQuery<ListedMessageRow>(
        `
          WITH selected_chat AS (
            SELECT id
            FROM chats
            WHERE id = $1
          ),
          limited_messages AS (
            SELECT id, chat_id, role, content_text, answer_metadata, created_at, sequence
            FROM messages
            WHERE chat_id = $1
            ORDER BY sequence DESC, id DESC
            LIMIT $2
          )
          SELECT
            selected_chat.id AS existing_chat_id,
            limited_messages.id,
            limited_messages.chat_id,
            limited_messages.role,
            limited_messages.content_text,
            limited_messages.answer_metadata,
            limited_messages.created_at,
            limited_messages.sequence
          FROM selected_chat
          LEFT JOIN limited_messages ON true
          ORDER BY limited_messages.sequence ASC NULLS LAST, limited_messages.id ASC NULLS LAST
        `,
        [chatId, limit],
      );

    if (queryResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Chat', chatId);
    }

    if (queryResult.rows[0]?.id === null) {
      return [];
    }

    return queryResult.rows.map((row) =>
      toChatMessageRecord({
        id: row.id!,
        chat_id: row.chat_id!,
        role: row.role!,
        content_text: row.content_text!,
        answer_metadata: row.answer_metadata,
        created_at: row.created_at!,
        sequence: row.sequence!,
      }));
  }

  async getChatSummary(chatId: ChatId): Promise<DurableChatSummaryRecord | null> {
    const queryResult = await this.executeQuery<SelectedChatSummaryRow>(
      `
        WITH selected_chat AS (
          SELECT id
          FROM chats
          WHERE id = $1
        )
        SELECT
          selected_chat.id AS existing_chat_id,
          chat_summaries.chat_id,
          chat_summaries.schema_version,
          chat_summaries.source,
          chat_summaries.summary_text,
          chat_summaries.covered_through_message_sequence,
          chat_summaries.updated_at
        FROM selected_chat
        LEFT JOIN chat_summaries ON chat_summaries.chat_id = selected_chat.id
      `,
      [chatId],
    );

    if (queryResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Chat', chatId);
    }

    const row = queryResult.rows[0]!;
    if (row.chat_id === null) {
      return null;
    }

    return toDurableChatSummaryRecord({
      chat_id: row.chat_id,
      schema_version: row.schema_version!,
      source: row.source!,
      summary_text: row.summary_text!,
      covered_through_message_sequence: row.covered_through_message_sequence!,
      updated_at: row.updated_at!,
    });
  }

  async appendMessage(request: AppendChatMessageRequest): Promise<ChatMessageRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.appendMessage(request));
    }

    const createdAt = new Date().toISOString();
    const normalizedContentText = normalizeContentText(request.contentText);
    const sequenceResult = await this.executeQuery<SequenceAllocationRow>(
      `
        UPDATE chats
        SET
          updated_at = $2,
          next_message_sequence = next_message_sequence + 1
        WHERE id = $1
        RETURNING next_message_sequence - 1 AS sequence
      `,
      [request.chatId, createdAt],
    );

    if (sequenceResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Chat', request.chatId);
    }

    const messageId = randomUUID();
    const insertResult = await this.executeQuery<MessageRow>(
      `
        INSERT INTO messages (
          id,
          chat_id,
          role,
          content_text,
          answer_metadata,
          created_at,
          sequence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, chat_id, role, content_text, answer_metadata, created_at, sequence
      `,
      [
        messageId,
        request.chatId,
        request.role,
        normalizedContentText,
        request.answerMetadata ?? null,
        createdAt,
        sequenceResult.rows[0]!.sequence,
      ],
    );

    return toChatMessageRecord(insertResult.rows[0]!);
  }

  async createLiveSession(request: CreateLiveSessionRequest): Promise<LiveSessionRecord> {
    const chat = await this.getChat(request.chatId);

    if (chat === null) {
      throw new ChatMemoryNotFoundError('Chat', request.chatId);
    }

    const insertResult = await this.executeQuery<LiveSessionRow>(
      `
        INSERT INTO live_sessions (
          id,
          chat_id,
          started_at,
          ended_at,
          status,
          ended_reason,
          resumption_handle,
          last_resumption_update_at,
          restorable,
          invalidated_at,
          invalidation_reason,
          summary_snapshot,
          context_state_snapshot
        )
        VALUES ($1, $2, $3, NULL, 'active', NULL, NULL, NULL, false, NULL, NULL, NULL, NULL)
        RETURNING
          id,
          chat_id,
          started_at,
          ended_at,
          status,
          ended_reason,
          resumption_handle,
          last_resumption_update_at,
          restorable,
          invalidated_at,
          invalidation_reason,
          summary_snapshot,
          context_state_snapshot
      `,
      [randomUUID(), request.chatId, request.startedAt ?? new Date().toISOString()],
    );

    return toLiveSessionRecord(insertResult.rows[0]!);
  }

  async listLiveSessions(
    chatId: ChatId,
    options?: ChatMemoryListOptions,
  ): Promise<LiveSessionRecord[]> {
    const limit = normalizeListLimit(options);
    const queryResult = limit === null
      ? await this.executeQuery<ListedLiveSessionRow>(
        `
          WITH selected_chat AS (
            SELECT id
            FROM chats
            WHERE id = $1
          )
          SELECT
            selected_chat.id AS existing_chat_id,
            live_sessions.id,
            live_sessions.chat_id,
            live_sessions.started_at,
            live_sessions.ended_at,
            live_sessions.status,
            live_sessions.ended_reason,
            live_sessions.resumption_handle,
            live_sessions.last_resumption_update_at,
            live_sessions.restorable,
            live_sessions.invalidated_at,
            live_sessions.invalidation_reason,
            live_sessions.summary_snapshot,
            live_sessions.context_state_snapshot
          FROM selected_chat
          LEFT JOIN live_sessions ON live_sessions.chat_id = selected_chat.id
          ORDER BY live_sessions.started_at DESC NULLS LAST, live_sessions.id DESC NULLS LAST
        `,
        [chatId],
      )
      : await this.executeQuery<ListedLiveSessionRow>(
        `
          WITH selected_chat AS (
            SELECT id
            FROM chats
            WHERE id = $1
          ),
          limited_live_sessions AS (
            SELECT
              id,
              chat_id,
              started_at,
              ended_at,
              status,
              ended_reason,
              resumption_handle,
              last_resumption_update_at,
              restorable,
              invalidated_at,
              invalidation_reason,
              summary_snapshot,
              context_state_snapshot
            FROM live_sessions
            WHERE chat_id = $1
            ORDER BY started_at DESC, id DESC
            LIMIT $2
          )
          SELECT
            selected_chat.id AS existing_chat_id,
            limited_live_sessions.id,
            limited_live_sessions.chat_id,
            limited_live_sessions.started_at,
            limited_live_sessions.ended_at,
            limited_live_sessions.status,
            limited_live_sessions.ended_reason,
            limited_live_sessions.resumption_handle,
            limited_live_sessions.last_resumption_update_at,
            limited_live_sessions.restorable,
            limited_live_sessions.invalidated_at,
            limited_live_sessions.invalidation_reason,
            limited_live_sessions.summary_snapshot,
            limited_live_sessions.context_state_snapshot
          FROM selected_chat
          LEFT JOIN limited_live_sessions ON true
          ORDER BY
            limited_live_sessions.started_at DESC NULLS LAST,
            limited_live_sessions.id DESC NULLS LAST
        `,
        [chatId, limit],
      );

    if (queryResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Chat', chatId);
    }

    if (queryResult.rows[0]?.id === null) {
      return [];
    }

    return queryResult.rows.map((row) =>
      toLiveSessionRecord({
        id: row.id!,
        chat_id: row.chat_id!,
        started_at: row.started_at!,
        ended_at: row.ended_at,
        status: row.status!,
        ended_reason: row.ended_reason,
        resumption_handle: row.resumption_handle,
        last_resumption_update_at: row.last_resumption_update_at,
        restorable: row.restorable!,
        invalidated_at: row.invalidated_at,
        invalidation_reason: row.invalidation_reason,
        summary_snapshot: row.summary_snapshot,
        context_state_snapshot: row.context_state_snapshot,
      }));
  }

  async upsertChatSummary(summary: DurableChatSummaryRecord): Promise<DurableChatSummaryRecord> {
    const chat = await this.getChat(summary.chatId);

    if (chat === null) {
      throw new ChatMemoryNotFoundError('Chat', summary.chatId);
    }

    await this.executeQuery(
      `
        INSERT INTO chat_summaries (
          chat_id,
          schema_version,
          source,
          summary_text,
          covered_through_message_sequence,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (chat_id) DO UPDATE
        SET
          schema_version = EXCLUDED.schema_version,
          source = EXCLUDED.source,
          summary_text = EXCLUDED.summary_text,
          covered_through_message_sequence = EXCLUDED.covered_through_message_sequence,
          updated_at = EXCLUDED.updated_at
      `,
      [
        summary.chatId,
        summary.schemaVersion,
        summary.source,
        summary.summaryText,
        summary.coveredThroughSequence,
        summary.updatedAt,
      ],
    );

    return summary;
  }

  async updateLiveSession(request: UpdateLiveSessionRequest): Promise<LiveSessionRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.updateLiveSession(request));
    }

    const existingLiveSession = await this.getLiveSessionForUpdate(request.id);
    const updatedLiveSession = buildUpdatedLiveSessionRecord(existingLiveSession, request);
    const updateResult = await this.executeQuery<LiveSessionRow>(
      `
        UPDATE live_sessions
        SET
          resumption_handle = $2,
          last_resumption_update_at = $3,
          restorable = $4,
          invalidated_at = $5,
          invalidation_reason = $6,
          summary_snapshot = $7,
          context_state_snapshot = $8
        WHERE id = $1
        RETURNING
          id,
          chat_id,
          started_at,
          ended_at,
          status,
          ended_reason,
          resumption_handle,
          last_resumption_update_at,
          restorable,
          invalidated_at,
          invalidation_reason,
          summary_snapshot,
          context_state_snapshot
      `,
      [
        updatedLiveSession.id,
        updatedLiveSession.resumptionHandle,
        updatedLiveSession.lastResumptionUpdateAt,
        updatedLiveSession.restorable,
        updatedLiveSession.invalidatedAt,
        updatedLiveSession.invalidationReason,
        updatedLiveSession.summarySnapshot ?? null,
        updatedLiveSession.contextStateSnapshot ?? null,
      ],
    );

    return toLiveSessionRecord(updateResult.rows[0]!);
  }

  async endLiveSession(request: EndLiveSessionRequest): Promise<LiveSessionRecord> {
    if (this.client === null) {
      return this.withTransaction((repository) => repository.endLiveSession(request));
    }

    const existingLiveSession = await this.getLiveSessionForUpdate(request.id);
    const endedLiveSession = buildEndedLiveSessionRecord(existingLiveSession, request);
    const updateResult = await this.executeQuery<LiveSessionRow>(
      `
        UPDATE live_sessions
        SET
          ended_at = $2,
          status = $3,
          ended_reason = $4,
          resumption_handle = NULL,
          last_resumption_update_at = $5,
          restorable = false,
          invalidated_at = $6,
          invalidation_reason = $7
        WHERE id = $1
        RETURNING
          id,
          chat_id,
          started_at,
          ended_at,
          status,
          ended_reason,
          resumption_handle,
          last_resumption_update_at,
          restorable,
          invalidated_at,
          invalidation_reason,
          summary_snapshot,
          context_state_snapshot
      `,
      [
        endedLiveSession.id,
        endedLiveSession.endedAt,
        endedLiveSession.status,
        endedLiveSession.endedReason,
        endedLiveSession.lastResumptionUpdateAt,
        endedLiveSession.invalidatedAt,
        endedLiveSession.invalidationReason,
      ],
    );

    return toLiveSessionRecord(updateResult.rows[0]!);
  }

  private async withCurrentChatRetry<TResult>(
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (!isConstraintViolation(error, CURRENT_CHAT_CONSTRAINT) || attempt === 2) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private async getLiveSessionForUpdate(id: string): Promise<LiveSessionRecord> {
    const queryResult = await this.executeQuery<LiveSessionRow>(
      `
        SELECT
          id,
          chat_id,
          started_at,
          ended_at,
          status,
          ended_reason,
          resumption_handle,
          last_resumption_update_at,
          restorable,
          invalidated_at,
          invalidation_reason,
          summary_snapshot,
          context_state_snapshot
        FROM live_sessions
        WHERE id = $1
        FOR UPDATE
      `,
      [id],
    );

    if (queryResult.rowCount === 0) {
      throw new ChatMemoryNotFoundError('Live session', id);
    }

    return toLiveSessionRecord(queryResult.rows[0]!);
  }

  private async executeQuery<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TResult>> {
    if (this.client !== null) {
      return this.client.query<TResult>(text, values ? [...values] : undefined);
    }

    return this.databaseService.query<TResult>(text, values);
  }
}
